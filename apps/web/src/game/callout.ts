import type { GameState, MeldType, PlayerView, Seat, TileKind } from '@mahjong/engine'
import { clipUrl } from './calloutClips'
import { DRAGONS, FLOWERS, MELD_CALLS, NUMERALS, SUIT_WORDS, WIN_CALLS, WINDS } from './calloutVocab'
import { audio } from './sound'

/** Something a player says out loud, as at a real table. */
export type Callout = { seat: Seat; text: string }

const SUITS = { dots: SUIT_WORDS.dots[0], bamboo: SUIT_WORDS.bamboo[0] }

/** Suit words the player prefers (饼 or 筒, 条 or 索). */
export type SuitWords = { dots: string; bamboo: string }

/** Spoken Mandarin name of a tile, e.g. 五万, 北风, 红中. */
export function tileCall(kind: TileKind, words: SuitWords = SUITS): string {
  switch (kind.suit) {
    case 'winds':
      return WINDS[kind.wind]
    case 'dragons':
      return DRAGONS[kind.dragon]
    case 'flowers':
      return FLOWERS[kind.flower - 1]!
    default:
      return NUMERALS[kind.rank - 1]! + (kind.suit === 'characters' ? SUIT_WORDS.characters[0] : words[kind.suit])
  }
}

/** The meld a seat just declared, if its meld list grew. */
function newMeld(prev: readonly { type: MeldType }[], next: readonly { type: MeldType }[]): { type: MeldType } | undefined {
  return next.length > prev.length ? next[next.length - 1] : undefined
}

/**
 * What a player would call out for a state transition: 吃 / 碰 / 杠 on a claim or kong,
 * 胡 / 自摸 on a win (always 胡: speech reads a bare 和 as hé), and the tile's name on a discard. Takes full states or one seat's views.
 * Pure, so it can be tested without audio.
 */
export function calloutFor(prev: GameState | PlayerView | null, next: GameState | PlayerView | null, words: SuitWords = SUITS): Callout | null {
  if (!prev || !next || prev === next) return null
  const phase = next.phase
  if (phase.kind === 'ended' && prev.phase.kind !== 'ended' && phase.result.type === 'win') {
    return { seat: phase.result.winner, text: phase.result.from === null ? WIN_CALLS.zimo : WIN_CALLS.hu }
  }
  // A promoted kong is announced when declared; the meld only changes once nobody robs it.
  if (phase.kind === 'robKong' && prev.phase.kind !== 'robKong') return { seat: phase.from, text: MELD_CALLS.kong }
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const meld = newMeld(prev.melds[seat]!, next.melds[seat]!)
    if (meld) return { seat, text: MELD_CALLS[meld.type] }
  }
  // A claim takes the tile back out of the pond, so a growing pond is always a fresh discard.
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const pond = next.discards[seat]!
    if (pond.length > prev.discards[seat]!.length) return { seat, text: tileCall(pond[pond.length - 1]!.kind, words) }
  }
  return null
}

let voice: SpeechSynthesisVoice | null | undefined

/** A Mandarin voice, preferring mainland Chinese. `null` if the system has none. */
function chineseVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null | undefined {
  if (voice !== undefined) return voice
  const voices = synth.getVoices()
  if (voices.length === 0) return undefined // not loaded yet
  const zh = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('zh'))
  voice = zh.find((v) => /zh-cn/i.test(v.lang.replace('_', '-'))) ?? zh.find((v) => !/hk|yue/i.test(v.lang)) ?? zh[0] ?? null
  return voice
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = undefined
  })
}

/** Each seat gets a slightly different voice so you can tell the players apart by ear. */
const PITCH = [1, 0.8, 1.2, 0.95] as const
const RATE = [1.1, 1.05, 1.15, 1] as const
/** Upper bound on waiting for one call, in case the browser never reports the end of speech. */
const MAX_CALL_MS = 2500

let lastCall: Promise<void> = Promise.resolve()
/**
 * Utterances not yet finished. Chrome garbage-collects an utterance nothing else references, and
 * then never reports its end (and can stop speaking altogether).
 */
const inFlight = new Set<SpeechSynthesisUtterance>()
/** When the latest call should have finished by, even if the browser never said so. */
let quietBy = 0

/** Resolves once every callout spoken so far has finished. */
export function calloutsDone(): Promise<void> {
  return lastCall
}

/**
 * Browsers only let a page start making sound from a tap or key press (iOS Safari especially), and
 * callouts come from timers and server messages. Waking the audio context and speaking nothing on
 * the first gesture unlocks both recordings and speech.
 */
function unlockOnGesture(): void {
  if (typeof window === 'undefined') return
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
    audio()
    try {
      if (typeof speechSynthesis !== 'undefined' && !speechSynthesis.speaking && !speechSynthesis.pending) speechSynthesis.speak(new SpeechSynthesisUtterance(''))
    } catch {
      // Nothing to unlock.
    }
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

unlockOnGesture()

/** Decoded recordings by URL. A failed load is forgotten, so the next call tries again. */
const clips = new Map<string, Promise<AudioBuffer | null>>()

function loadClip(ac: AudioContext, url: string): Promise<AudioBuffer | null> {
  let clip = clips.get(url)
  if (!clip) {
    clip = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`clip ${r.status}`))))
      .then((data) => ac.decodeAudioData(data))
      .catch(() => {
        clips.delete(url)
        return null
      })
    clips.set(url, clip)
  }
  return clip
}

/** Settles once the previous recording has been scheduled, so calls keep their order while clips load. */
let clipQueue: Promise<unknown> = Promise.resolve()
/** Audio-clock time when the latest scheduled recording ends. */
let clipsEnd = 0

/** Play a seat's recording after any still playing; speak instead if it fails to load. Settles when it ends. */
function playClip(ac: AudioContext, url: string, call: Callout): Promise<void> {
  const clip = loadClip(ac, url)
  const turn = clipQueue.then(() => clip)
  clipQueue = turn
  return turn.then((buffer) => {
    if (!buffer) return speak(call)
    // Still waiting for a first tap: playing every call queued meanwhile in one burst later would be worse than silence.
    if (ac.state !== 'running') return
    const source = ac.createBufferSource()
    source.buffer = buffer
    source.connect(ac.destination)
    const start = Math.max(ac.currentTime, clipsEnd)
    clipsEnd = start + buffer.duration
    return new Promise<void>((resolve) => {
      source.onended = () => resolve()
      source.start(start)
    })
  })
}

/** Speak with the browser's speech synthesis. Settles when it ends, at once where there is no Chinese voice. */
function speak({ seat, text }: Callout): Promise<void> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve()
  const v = chineseVoice(speechSynthesis)
  if (v === null) return Promise.resolve() // no Chinese voice: English voices would mangle the characters
  // A synth still busy long after the last call should have ended is stuck (Chrome, and after the
  // tab was in the background): everything queued behind it would stay silent until a reload.
  if ((speechSynthesis.speaking || speechSynthesis.pending) && performance.now() > quietBy) {
    speechSynthesis.cancel()
    inFlight.clear()
  }
  if (speechSynthesis.paused) speechSynthesis.resume()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = v?.lang ?? 'zh-CN'
  if (v) u.voice = v
  u.pitch = PITCH[seat]
  u.rate = RATE[seat]
  inFlight.add(u)
  quietBy = Math.max(quietBy, performance.now()) + MAX_CALL_MS
  const ended = new Promise<void>((resolve) => {
    u.onend = u.onerror = () => {
      inFlight.delete(u)
      resolve()
    }
  })
  speechSynthesis.speak(u)
  return ended
}

/**
 * Say a callout: the seat's recording where there is one, else the browser's speech. Silently does
 * nothing where neither can play.
 */
export function speakCallout(call: Callout): void {
  try {
    const url = clipUrl(call.seat, call.text)
    const ac = url ? audio() : null
    const ended = url && ac ? playClip(ac, url, call) : speak(call)
    const capped = new Promise<void>((resolve) => {
      ended.then(resolve, resolve)
      setTimeout(resolve, MAX_CALL_MS)
    })
    lastCall = Promise.all([lastCall, capped]).then(() => {})
  } catch {
    // Speech is decoration; never let it break play.
  }
}
