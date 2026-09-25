import { describe, expect, it } from 'vitest'
import { applyAction, HANDS_PER_MATCH, isMatchOver, legalActions, mulberry32, newMatch, nextHand, playerAt, seatOf, SEATING, type Match, type Player, type Seat } from './index'

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

describe('official re-seating (V27)', () => {
  /** Apply a round-boundary move to a seating: `move[fromSeat] = toSeat`. */
  const moveSeats = (seating: readonly number[], move: number[]) => {
    const next = [0, 0, 0, 0]
    seating.forEach((player, seat) => (next[move[seat]!] = player))
    return next
  }

  it('SEATING follows the rule text round by round', () => {
    const r2 = moveSeats(SEATING[0]!, [1, 0, 3, 2]) // E↔S, W↔N
    const r3 = moveSeats(r2, [2, 3, 1, 0]) // E→W, S→N, W→S, N→E
    const r4 = moveSeats(r3, [1, 0, 3, 2]) // E↔S, W↔N
    expect([SEATING[0], r2, r3, r4]).toEqual(SEATING.map((r) => [...r]))
  })

  it('every player sits in each position once and deals once per round', () => {
    let m = newMatch(3)
    const positions = [new Set<number>(), new Set<number>(), new Set<number>(), new Set<number>()]
    const dealsPerRound: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
    for (let h = 0; h < HANDS_PER_MATCH; h++) {
      const round = Math.floor(h / 4)
      for (const p of [0, 1, 2, 3] as Player[]) positions[p]!.add(seatOf(m, p))
      dealsPerRound[round]![playerAt(m, m.current!.dealer)]!++
      if (h % 4 !== 0) expect(m.seating).toEqual(m.history.at(-1)!.seating) // no change within a round
      m = nextHand(m, { type: 'drawn' })
    }
    for (const seen of positions) expect(seen.size).toBe(4)
    for (const round of dealsPerRound) expect(round).toEqual([1, 1, 1, 1])
  })

  it('maps seat deltas to players with that hand’s seating', () => {
    let m = newMatch(8)
    for (let h = 0; h < 4; h++) m = nextHand(m, { type: 'drawn' })
    // Round 2: seat 0 is player 1. A self-draw by seat 0 credits player 1.
    const result = { type: 'win' as const, winner: 0 as Seat, from: null, tileId: 0, score: { fans: [], total: 8, flowerPoints: 0 }, deltas: [48, -16, -16, -16] }
    m = nextHand(m, result)
    expect(m.scores).toEqual([-16, 48, -16, -16])
    expect(m.history.at(-1)!.playerDeltas).toEqual([-16, 48, -16, -16])
  })
})
