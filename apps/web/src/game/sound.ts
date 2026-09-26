import type { GameState, PlayerView, Seat } from '@mahjong/engine'

export type SoundKind = 'discard' | 'claim' | 'win' | 'drawn' | 'yourTurn'

const count = (arrays: readonly (readonly unknown[])[]) => arrays.reduce((n, a) => n + a.length, 0)

/**
 * Which sound (if any) a table transition deserves. Takes full states or one seat's views, so it works
 * offline and online alike. Pure, so it can be tested without audio.
 */
export function soundFor(prev: GameState | PlayerView | null, next: GameState | PlayerView | null, me: Seat): SoundKind | null {
  if (!prev || !next || prev === next) return null
  if (next.phase.kind === 'ended' && prev.phase.kind !== 'ended') return next.phase.result.type === 'win' ? 'win' : 'drawn'
  if (count(next.melds) > count(prev.melds)) return 'claim'
  if (count(next.discards) > count(prev.discards)) return 'discard'
  if (next.turn === me && next.phase.kind === 'discard' && (prev.turn !== me || prev.phase.kind !== 'discard')) return 'yourTurn'
  return null
}

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(ac: AudioContext, freq: number, start: number, length: number, gain: number, type: OscillatorType = 'sine') {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, ac.currentTime + start)
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + length)
  osc.connect(g).connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + length + 0.02)
}

/** A short filtered noise burst: the "clack" of a tile on the table. */
function clack(ac: AudioContext, gain: number) {
  const length = 0.06
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * length), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const g = ac.createGain()
  src.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = 2200
  g.gain.value = gain
  src.connect(filter).connect(g).connect(ac.destination)
  src.start()
}

/** Play a synthesized sound. Silently does nothing where Web Audio is unavailable. */
export function playSound(kind: SoundKind): void {
  const ac = audio()
  if (!ac) return
  switch (kind) {
    case 'discard':
      return clack(ac, 0.5)
    case 'claim':
      clack(ac, 0.6)
      return tone(ac, 660, 0.03, 0.18, 0.08, 'triangle')
    case 'yourTurn':
      return tone(ac, 880, 0, 0.12, 0.05)
    case 'drawn':
      tone(ac, 392, 0, 0.25, 0.06, 'triangle')
      return tone(ac, 330, 0.2, 0.35, 0.06, 'triangle')
    case 'win':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.11, 0.35, 0.08, 'triangle'))
  }
}
