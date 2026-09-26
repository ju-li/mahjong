import { onBeforeUnmount, ref } from 'vue'
import type { Player } from '@mahjong/engine'
import { MAX_VOICE_BYTES, MAX_VOICE_MS, type VoiceClip, type VoiceMemo } from '@mahjong/protocol'
import { audio } from './sound'

/** Recordings shorter than this are taps on the button, not messages. */
export const MIN_VOICE_MS = 300
/** Speech-quality Opus: 15 s comes to about 60 KB. */
const BITS_PER_SECOND = 32_000
/** Memos waiting to play beyond this are dropped rather than piling up. */
const MAX_QUEUE = 6

/** Containers to record in, best first: Opus in WebM (Chrome, Firefox), then MP4 (Safari). */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']

/** The first container the recorder supports, or '' to let it choose. */
export function pickMimeType(isSupported: (type: string) => boolean): string {
  return MIME_TYPES.find((type) => isSupported(type)) ?? ''
}

export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export type RecorderState = 'idle' | 'starting' | 'recording' | 'denied' | 'unsupported'

/**
 * Push-to-talk: `start` on press, `stop` on release; the clip goes to `send` once it is long enough.
 * The microphone is only held while recording, so the browser's mic indicator goes away between memos.
 */
export function useVoiceRecorder(send: (clip: VoiceClip) => void) {
  const state = ref<RecorderState>(canRecord() ? 'idle' : 'unsupported')
  /** Whole seconds recorded so far. */
  const elapsed = ref(0)
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let released = false
  let startedAt = 0
  let ticker: ReturnType<typeof setInterval> | undefined
  let limit: ReturnType<typeof setTimeout> | undefined

  function releaseMic() {
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
  }

  async function start(): Promise<void> {
    if (state.value === 'unsupported' || state.value === 'starting' || state.value === 'recording') return
    state.value = 'starting'
    released = false
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      const name = (e as { name?: string })?.name
      state.value = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'idle'
      return
    }
    // Let go while the browser was still asking for the microphone: nothing to send.
    if (released) {
      releaseMic()
      state.value = 'idle'
      return
    }
    const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType: mimeType || undefined, audioBitsPerSecond: BITS_PER_SECOND })
    } catch {
      releaseMic()
      state.value = 'unsupported'
      return
    }
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = async () => {
      const ms = Math.min(Math.round(performance.now() - startedAt), MAX_VOICE_MS)
      releaseMic()
      if (ms < MIN_VOICE_MS || chunks.length === 0) return
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' })
      if (blob.size > MAX_VOICE_BYTES) return
      send({ mime: blob.type, ms, data: new Uint8Array(await blob.arrayBuffer()) })
    }
    recorder = rec
    rec.start()
    startedAt = performance.now()
    elapsed.value = 0
    state.value = 'recording'
    ticker = setInterval(() => (elapsed.value = Math.floor((performance.now() - startedAt) / 1000)), 250)
    limit = setTimeout(stop, MAX_VOICE_MS)
  }

  /** Release: send what was recorded (or drop it if it was only a tap). */
  function stop(): void {
    released = true
    clearInterval(ticker)
    clearTimeout(limit)
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorder = null
    if (state.value === 'recording') state.value = 'idle'
  }

  onBeforeUnmount(stop)

  return { state, elapsed, start, stop }
}

/** Plays one memo to the end, or until `signal` aborts. */
export type ClipPlayer = (memo: VoiceMemo, signal: AbortSignal) => Promise<void>

/**
 * Plays through the app's audio context, which is already unlocked by the player's taps (iOS won't
 * play a fresh <audio> element without one); falls back to an <audio> element if decoding fails.
 */
export const playClip: ClipPlayer = async (memo, signal) => {
  const bytes = new Uint8Array(memo.data)
  const ac = audio()
  if (ac) {
    try {
      // Decoding takes ownership of the buffer; keep `bytes` intact for the fallback.
      const buffer = await ac.decodeAudioData(bytes.slice().buffer)
      if (signal.aborted) return
      const src = ac.createBufferSource()
      src.buffer = buffer
      src.connect(ac.destination)
      await new Promise<void>((resolve) => {
        src.onended = () => resolve()
        signal.addEventListener('abort', () => {
          src.stop()
          resolve()
        })
        src.start()
      })
      return
    } catch {
      // This container can't be decoded here; try the media element.
    }
  }
  if (signal.aborted) return
  const url = URL.createObjectURL(new Blob([bytes], { type: memo.mime }))
  try {
    const el = new Audio(url)
    await new Promise<void>((resolve) => {
      el.onended = el.onerror = () => resolve()
      signal.addEventListener('abort', () => {
        el.pause()
        resolve()
      })
      el.play().catch(() => resolve())
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Other players' memos, played one after another as they arrive so two people talking at once
 * don't drown each other out. `speaking` is whose memo is playing.
 */
export function useVoicePlayer(play: ClipPlayer = playClip) {
  const speaking = ref<Player | null>(null)
  const queue: VoiceMemo[] = []
  let current: AbortController | null = null

  async function drain() {
    while (queue.length > 0) {
      const memo = queue.shift()!
      const controller = new AbortController()
      current = controller
      speaking.value = memo.from
      // A clip that never reports its end mustn't hold up the rest.
      const guard = setTimeout(() => controller.abort(), MAX_VOICE_MS + 2000)
      try {
        await play(memo, controller.signal)
      } catch {
        // Unplayable: skip it.
      } finally {
        clearTimeout(guard)
      }
      if (current !== controller) return // cleared meanwhile
    }
    current = null
    speaking.value = null
  }

  function enqueue(memo: VoiceMemo): void {
    if (queue.length >= MAX_QUEUE) return
    queue.push(memo)
    if (current === null) void drain()
  }

  /** Stop playing and forget anything waiting (muted, or left the table). */
  function clear(): void {
    queue.length = 0
    current?.abort()
    current = null
    speaking.value = null
  }

  return { speaking, enqueue, clear }
}
