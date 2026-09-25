import { describe, expect, it } from 'vitest'
import { applyAction, HANDS_PER_MATCH, isMatchOver, legalActions, mulberry32, newMatch, nextHand, type Match, type Seat } from './index'

/** Play a whole match with seeded random legal actions (claims favoured, so some hands are won). */
function playMatch(seed: number): Match {
  const rand = mulberry32(seed)
  let match = newMatch(seed)
  while (!isMatchOver(match)) {
    let state = match.current!
    while (state.phase.kind !== 'ended') {
      const seat = ([0, 1, 2, 3] as Seat[]).find((s) => legalActions(state, s).length > 0)!
      const legal = legalActions(state, seat)
      const win = legal.find((a) => a.type === 'win')
      const claims = legal.filter((a) => a.type !== 'pass' && a.type !== 'discard' && a.type !== 'draw')
      const pool = win ? [win] : claims.length > 0 ? claims : legal
      state = applyAction(state, pool[Math.floor(rand() * pool.length)]!)
    }
    match = nextHand(match, state.phase.result)
  }
  return match
}

describe('match', () => {
  it('rotates the dealer every hand and the prevailing wind every four hands', () => {
    let m = newMatch(9)
    const seen: string[] = []
    for (let i = 0; i < HANDS_PER_MATCH; i++) {
      seen.push(`${m.current!.dealer}${m.current!.prevailingWind}`)
      m = nextHand(m, { type: 'drawn' })
    }
    expect(seen).toEqual([
      '0E', '1E', '2E', '3E',
      '0S', '1S', '2S', '3S',
      '0W', '1W', '2W', '3W',
      '0N', '1N', '2N', '3N',
    ])
    expect(isMatchOver(m)).toBe(true)
    expect(m.current).toBeNull()
    expect(() => nextHand(m, { type: 'drawn' })).toThrow()
  })

  it('deals different, reproducible hands', () => {
    const a = newMatch(5)
    const b = newMatch(5)
    expect(a).toEqual(b)
    const seeds = new Set<number>()
    let m = a
    for (let i = 0; i < HANDS_PER_MATCH; i++) {
      seeds.add(m.current!.seed)
      m = nextHand(m, { type: 'drawn' })
    }
    expect(seeds.size).toBe(HANDS_PER_MATCH)
  })

  it('full random matches finish with zero-sum scores and are reproducible', () => {
    let wins = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const m = playMatch(seed)
      expect(m.history).toHaveLength(HANDS_PER_MATCH)
      expect(m.scores.reduce((a, b) => a + b, 0)).toBe(0)
      wins += m.history.filter((h) => h.result.type === 'win').length
      if (seed <= 2) expect(playMatch(seed)).toEqual(m)
    }
    expect(wins).toBeGreaterThan(0)
  })
})
