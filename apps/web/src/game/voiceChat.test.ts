import { describe, expect, it } from 'vitest'
import type { VoiceMemo } from '@mahjong/protocol'
import { barLevels, clockOf, pickMimeType, useVoicePlayer, type ClipPlayer } from './voiceChat'

const memo = (from: 0 | 1 | 2 | 3): VoiceMemo => ({ from, mime: 'audio/webm', ms: 1000, data: new Uint8Array([from]) })

/** A clip player whose clips end only when the test says so. */
function controlledPlayer() {
  const started: { from: number; signal: AbortSignal; end: () => void }[] = []
  const play: ClipPlayer = (m, signal) => new Promise<void>((resolve) => started.push({ from: m.from, signal, end: resolve }))
  return { play, started }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('pickMimeType', () => {
  it('prefers Opus in WebM, then falls back to what the browser can record', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4')
    expect(pickMimeType(() => false)).toBe('')
  })
})

describe('barLevels', () => {
  it('averages the voice range of the spectrum into bars from 0 to 1, skipping the hum bin', () => {
    // 60 bins: the bottom sixth, less bin 0, is bins 1–10, two per bar.
    const bytes = new Uint8Array(60).fill(255)
    bytes.set([255, 255, 255, 0, 0, 51, 51, 0, 0, 0, 0], 0)
    expect(barLevels(bytes, 5)).toEqual([1, 0, 0.2, 0, 0])
    expect(barLevels(new Uint8Array(128), 5)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('clockOf', () => {
  it('shows whole seconds recorded', () => {
    expect(clockOf(0)).toBe('0:00')
    expect(clockOf(4_900)).toBe('0:04')
    expect(clockOf(10_000)).toBe('0:10')
  })
})

describe('useVoicePlayer', () => {
  it('plays memos one after another and says who is speaking', async () => {
    const { play, started } = controlledPlayer()
    const player = useVoicePlayer(play)
    expect(player.speaking.value).toBeNull()
    player.enqueue(memo(1))
    player.enqueue(memo(2))
    await flush()
    expect(started.map((s) => s.from)).toEqual([1]) // the second waits its turn
    expect(player.speaking.value).toBe(1)

    started[0]!.end()
    await flush()
    expect(started.map((s) => s.from)).toEqual([1, 2])
    expect(player.speaking.value).toBe(2)

    started[1]!.end()
    await flush()
    expect(player.speaking.value).toBeNull()
  })

  it('skips a clip that fails to play', async () => {
    const played: number[] = []
    const player = useVoicePlayer(async (m) => {
      played.push(m.from)
      if (m.from === 1) throw new Error('undecodable')
    })
    player.enqueue(memo(1))
    player.enqueue(memo(3))
    await flush()
    await flush()
    expect(played).toEqual([1, 3])
    expect(player.speaking.value).toBeNull()
  })

  it('stops and forgets everything when cleared', async () => {
    const { play, started } = controlledPlayer()
    const player = useVoicePlayer(play)
    player.enqueue(memo(1))
    player.enqueue(memo(2))
    await flush()
    player.clear()
    expect(started[0]!.signal.aborted).toBe(true)
    expect(player.speaking.value).toBeNull()
    started[0]!.end()
    await flush()
    expect(started).toHaveLength(1) // the queued memo was dropped

    player.enqueue(memo(3)) // and it starts again afterwards
    await flush()
    expect(started.map((s) => s.from)).toEqual([1, 3])
    expect(player.speaking.value).toBe(3)
  })
})
