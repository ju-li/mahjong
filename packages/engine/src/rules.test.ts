import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, newHand, type Action, type GameState } from './index'
import {
  actingSeats,
  deepFreeze,
  effectiveSize,
  expectConservation,
  expectNoFlowersInHands,
  playRandomHand,
} from './testing'

function checkState(state: GameState): void {
  expectConservation(state)
  expectNoFlowersInHands(state)
  if (state.phase.kind === 'discard') expect(effectiveSize(state, state.turn)).toBe(14)
}

describe('turn loop', () => {
  it('only the dealer acts first, and only by discarding', () => {
    const s = newHand({ seed: 5, dealer: 1, prevailingWind: 'E' })
    expect(actingSeats(s)).toEqual([1])
    expect(legalActions(s, 1).every((a) => a.type === 'discard' || a.type === 'kong' || a.type === 'win')).toBe(true)
  })

  it('discard → next seat draws', () => {
    let s = newHand({ seed: 5, dealer: 0, prevailingWind: 'E' })
    const discard = legalActions(s, 0).find((a) => a.type === 'discard')!
    s = applyAction(s, discard)
    // With no claims possible every other seat auto-passes; otherwise claimants answer first.
    while (s.phase.kind === 'claim') s = applyAction(s, { type: 'pass', seat: actingSeats(s)[0]! })
    expect(s.phase.kind).toBe('draw')
    expect(s.turn).toBe(1)
    s = applyAction(s, { type: 'draw', seat: 1 })
    expect(s.phase.kind).toBe('discard')
    expect(effectiveSize(s, 1)).toBe(14)
  })

  it('random hands keep invariants and end drawn when the wall runs out', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { state } = playRandomHand(seed, { claimBias: 0, onState: checkState })
      expect(state.phase.kind).toBe('ended')
      if (state.phase.kind === 'ended' && state.phase.result.type === 'drawn') expect(state.wall.length).toBe(0)
    }
  })

  it('never mutates the input state', () => {
    let s = deepFreeze(newHand({ seed: 11, dealer: 0, prevailingWind: 'E' }))
    for (let i = 0; i < 40 && s.phase.kind !== 'ended'; i++) {
      const seat = actingSeats(s)[0]!
      s = deepFreeze(applyAction(s, legalActions(s, seat).at(-1)!))
    }
  })

  it('rejects illegal actions and leaves state unchanged', () => {
    const s = newHand({ seed: 3, dealer: 0, prevailingWind: 'E' })
    const before = JSON.stringify(s)
    const illegal: Action[] = [
      { type: 'draw', seat: 0 },
      { type: 'discard', seat: 1, tileId: s.hands[1]![0]!.id },
      { type: 'discard', seat: 0, tileId: s.hands[1]![0]!.id },
      { type: 'pass', seat: 2 },
      { type: 'win', seat: 0 },
    ]
    for (const a of illegal) expect(() => applyAction(s, a)).toThrow(/illegal action/)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('same seed and actions give the same final state', () => {
    const a = playRandomHand(77)
    const b = playRandomHand(77)
    expect(a.actions).toEqual(b.actions)
    expect(a.state).toEqual(b.state)
  })
})
