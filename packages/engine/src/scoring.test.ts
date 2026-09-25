import { describe, expect, it } from 'vitest'
import { applyAction, FAN_BY_ID, FANS, legalActions, type Action, type GameState, type Seat } from './index'
import { buildState, fanMap, playRandomHand, scoreNotation } from './testing'
import { kindIndex } from './tiles'

describe('fan table', () => {
  it('has the 81 MCR fans with the official point spread, plus the kong combination', () => {
    const official = FANS.filter((f) => f.id !== 'concealedKongAndMeldedKong')
    expect(official).toHaveLength(81)
    expect(FANS).toHaveLength(82)
    expect(new Set(FANS.map((f) => f.id)).size).toBe(82)
    const spread: Record<number, number> = {}
    for (const f of official) spread[f.points] = (spread[f.points] ?? 0) + 1
    expect(spread).toEqual({ 88: 7, 64: 6, 48: 2, 32: 3, 24: 9, 16: 6, 12: 5, 8: 9, 6: 7, 4: 4, 2: 10, 1: 13 })
  })

  it('only excludes known, lower-or-equal fans', () => {
    for (const f of FANS) {
      for (const x of f.excludes) {
        expect(FAN_BY_ID[x], `${f.id} excludes ${x}`).toBeDefined()
        expect(FAN_BY_ID[x].points).toBeLessThanOrEqual(f.points)
      }
    }
  })
})

describe('scoreHand basics', () => {
  it('returns null for an incomplete hand', () => {
    expect(scoreNotation('123m 456m 789m 123p 45p', '5p')).toBeNull()
  })

  it('scores a complete hand and adds flowers separately', () => {
    const s = scoreNotation('123m 456m 789m 123p 44p', '4p', { flowers: 2 })!
    expect(s.flowerPoints).toBe(2)
    expect(fanMap(s)).toMatchObject({ pureStraight: 1, flowerTiles: 2 })
    expect(s.total).toBe(s.fans.reduce((v, f) => v + f.points * f.count, 0))
  })

  it('awards Chicken Hand when nothing else scores', () => {
    // Three suits plus an honor pair, open melds, discard win on a two-sided wait: no fan at all.
    const s = scoreNotation('678s NN', '6s', { melds: ['chow 234m', 'chow 567p', 'pung 222s'] })!
    expect(fanMap(s)).toEqual({ chickenHand: 1 })
    expect(s.total).toBe(8)
  })
})

describe('wins in play', () => {
  const discardOf = (s: GameState, seat: Seat, k: number): Action => ({
    type: 'discard',
    seat,
    tileId: s.hands[seat]!.find((t) => kindIndex(t.kind) === k)!.id,
  })

  it('head bump: the nearest winner after the discarder takes the tile', () => {
    // Seats 1 and 3 can both win on 5m; seat 2 could pung it.
    let s = buildState({
      hands: ['5m 123p 456p 789p 11s 99s', '46m 123s 456s 789s EE', '55m 13p 46s 78s CC FF', '46m 234p 567s WWW P'.replace('P', 'PP')],
    })
    s = applyAction(s, discardOf(s, 0, 4))
    expect(legalActions(s, 1).map((a) => a.type)).toContain('win')
    expect(legalActions(s, 3).map((a) => a.type)).toContain('win')
    s = applyAction(s, { type: 'win', seat: 3 })
    s = applyAction(s, { type: 'pung', seat: 2 })
    s = applyAction(s, { type: 'win', seat: 1 })
    expect(s.phase).toMatchObject({ kind: 'ended', result: { type: 'win', winner: 1, from: 0 } })
  })

  it('random play now produces wins and keeps invariants', () => {
    let wins = 0
    for (let seed = 1; seed <= 150; seed++) {
      const { state } = playRandomHand(seed, { claimBias: 1 })
      if (state.phase.kind === 'ended' && state.phase.result.type === 'win') wins++
    }
    expect(wins).toBeGreaterThan(0)
  })
})
