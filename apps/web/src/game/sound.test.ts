import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, newHand, type GameState, type Seat } from '@mahjong/engine'
import { soundFor } from './sound'

function step(s: GameState): GameState {
  const seat = ([0, 1, 2, 3] as Seat[]).find((x) => legalActions(s, x).length > 0)!
  const legal = legalActions(s, seat)
  return applyAction(s, legal.find((a) => a.type === 'discard' || a.type === 'draw') ?? legal.find((a) => a.type === 'pass') ?? legal[0]!)
}

describe('soundFor', () => {
  it('stays silent without a change', () => {
    const s = newHand({ seed: 1, dealer: 0, prevailingWind: 'E' })
    expect(soundFor(null, s, 0)).toBeNull()
    expect(soundFor(s, s, 0)).toBeNull()
  })

  it('clacks on a discard and chimes when your turn starts', () => {
    let s = newHand({ seed: 2, dealer: 3, prevailingWind: 'E' })
    const kinds = new Set<string>()
    for (let i = 0; i < 40 && s.phase.kind !== 'ended'; i++) {
      const next = step(s)
      const k = soundFor(s, next, 0)
      if (k) kinds.add(k)
      s = next
    }
    expect(kinds.has('discard')).toBe(true)
    expect(kinds.has('yourTurn')).toBe(true)
  })

  it('marks the end of a hand', () => {
    const s = newHand({ seed: 3, dealer: 0, prevailingWind: 'E' })
    expect(soundFor(s, { ...s, phase: { kind: 'ended', result: { type: 'drawn' } } }, 0)).toBe('drawn')
  })
})
