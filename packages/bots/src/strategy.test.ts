import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, newHand, sameAction, viewFor, type GameState, type Seat } from '@mahjong/engine'
import { chooseAction } from './strategy'
import type { Difficulty } from './protocol'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

/** Play a hand where every seat is a bot. Returns every (request, action) pair. */
function playBots(seed: number, difficulty: Difficulty) {
  let state: GameState = newHand({ seed, dealer: 0, prevailingWind: 'E' })
  const log: { seat: Seat; seed: number; action: ReturnType<typeof chooseAction> }[] = []
  for (let step = 0; state.phase.kind !== 'ended' && step < 2000; step++) {
    const seat = ([0, 1, 2, 3] as Seat[]).find((s) => legalActions(state, s).length > 0)!
    const legal = legalActions(state, seat)
    const req = { view: viewFor(state, seat), legal, difficulty, seed: seed * 1000 + step }
    const action = chooseAction(req)
    expect(legal.some((a) => sameAction(a, action))).toBe(true)
    expect(chooseAction(req)).toEqual(action)
    log.push({ seat, seed: req.seed, action })
    state = applyAction(state, action)
  }
  return { state, log }
}

describe('bot strategy', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}: only legal actions, deterministic, hands terminate`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const a = playBots(seed, difficulty)
        expect(a.state.phase.kind).toBe('ended')
        expect(playBots(seed, difficulty).log).toEqual(a.log)
      }
    })
  }
})

describe('bot strength', () => {
  it('medium outscores easy over 30 seeded hands (seats alternate)', () => {
    let medium = 0
    for (let seed = 1; seed <= 30; seed++) {
      const levels: Difficulty[] = seed % 2 ? ['easy', 'medium', 'easy', 'medium'] : ['medium', 'easy', 'medium', 'easy']
      let state: GameState = newHand({ seed, dealer: (seed % 4) as Seat, prevailingWind: 'E' })
      for (let step = 0; state.phase.kind !== 'ended'; step++) {
        const seat = ([0, 1, 2, 3] as Seat[]).find((s) => legalActions(state, s).length > 0)!
        const req = { view: viewFor(state, seat), legal: legalActions(state, seat), difficulty: levels[seat]!, seed: seed * 7919 + step }
        state = applyAction(state, chooseAction(req))
      }
      const r = state.phase.kind === 'ended' ? state.phase.result : null
      if (r?.type === 'win') r.deltas.forEach((d, s) => levels[s] === 'medium' && (medium += d))
    }
    expect(medium).toBeGreaterThan(0)
  })
})
