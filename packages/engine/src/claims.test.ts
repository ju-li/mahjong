import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, type Action, type GameState, type Seat } from './index'
import { buildState, effectiveSize, expectConservation, expectNoFlowersInHands, playRandomHand } from './testing'

import { kindIndex, type Tile } from './tiles'

const kindOf = (t: Tile) => kindIndex(t.kind)
const discardOf = (s: GameState, seat: Seat, kindIdx: number): Action => {
  const tile = s.hands[seat]!.find((t) => kindOf(t) === kindIdx)!
  return { type: 'discard', seat, tileId: tile.id }
}

// 13-tile filler hands that cannot claim a 5m discard. Tile counts across a fixture must stay ≤ 4.
const FILL_A = 'EEE SSS WWW NNN C'
const FILL_B = '19m 19p 19s FFF PPP C'
const FILL_C = '234s 678s 23m 89m 88p 3p'

describe('claims', () => {
  it('pung beats chow; only the next seat may chow', () => {
    let s = buildState({
      hands: ['5m 123p 456p 789p 11s 99s', '46m 123s 456s 78s EE N', '55m 123p 456s 78s CC F', '46m 234p 567s FFF P N'],
      turn: 0,
    })
    s = applyAction(s, discardOf(s, 0, 4))
    expect(s.phase.kind).toBe('claim')
    const types = (seat: Seat) => legalActions(s, seat).map((a) => a.type)
    expect(types(1)).toContain('chow')
    expect(types(2)).toEqual(['pung', 'pass'])
    expect(types(3)).toEqual([]) // seat 3 holds 4m6m but is not next: auto-pass
    const chow = legalActions(s, 1).find((a) => a.type === 'chow')!
    s = applyAction(s, chow)
    s = applyAction(s, { type: 'pung', seat: 2 })
    expect(s.turn).toBe(2)
    expect(s.phase).toEqual({ kind: 'discard', drawnTileId: null, afterKong: false })
    expect(s.melds[2]![0]!.type).toBe('pung')
    expect(s.melds[1]).toEqual([])
    expect(s.discards[0]).toEqual([])
    expect(effectiveSize(s, 2)).toBe(14)
    expectConservation(s)
  })

  it('chow takes the chosen tiles and passes the turn to the claimer', () => {
    let s = buildState({ hands: ['5m 123p 456p 789p 11s 99s', '46m 123s 456s 789s CC', FILL_A, FILL_B] })
    s = applyAction(s, discardOf(s, 0, 4))
    s = applyAction(s, legalActions(s, 1).find((a) => a.type === 'chow')!)
    expect(s.turn).toBe(1)
    expect(s.melds[1]![0]!.tiles.map(kindOf)).toEqual([3, 4, 5])
    expect(s.melds[1]![0]!.from).toBe(0)
    expect(effectiveSize(s, 1)).toBe(14)
  })

  it('exposed kong draws a replacement from the back of the wall', () => {
    let s = buildState({ hands: ['5m 123p 456p 789p 11s 99s', FILL_A, '555m 123p 456s 789s F', FILL_B], wallBack: '7s' })
    const backId = s.wall.at(-1)!.id
    s = applyAction(s, discardOf(s, 0, 4))
    s = applyAction(s, { type: 'kong', seat: 2 })
    expect(s.melds[2]![0]!.type).toBe('kong')
    expect(s.phase).toEqual({ kind: 'discard', drawnTileId: backId, afterKong: true })
    expect(effectiveSize(s, 2)).toBe(14)
    expectConservation(s)
  })

  it('concealed kong and promoted kong in the discard phase', () => {
    let s = buildState({
      hands: ['5555m 123p 456p 789p 9s', FILL_A, FILL_B, FILL_C],
      wallBack: '9s',
    })
    const kong = legalActions(s, 0).find((a) => a.type === 'kong')!
    expect(kong).toMatchObject({ tileIds: expect.any(Array) })
    s = applyAction(s, kong)
    expect(s.melds[0]![0]).toMatchObject({ type: 'kong', exposed: false })
    expect(effectiveSize(s, 0)).toBe(14)
    expect(s.phase).toMatchObject({ kind: 'discard', afterKong: true })

    let p = buildState({
      // 11 concealed + exposed pung = 14 effective tiles in the discard phase.
      hands: ['7m 123p 456p 789p 9s', FILL_A, FILL_B, FILL_C],
      melds: [{ seat: 0, type: 'pung', tiles: '777m' }],
    })
    const promote = legalActions(p, 0).find((a) => a.type === 'kong' && a.tileIds?.length === 1)!
    p = applyAction(p, promote)
    expect(p.melds[0]![0]!.type).toBe('kong')
    expect(p.melds[0]![0]!.tiles).toHaveLength(4)
    expect(effectiveSize(p, 0)).toBe(14)
    expectConservation(p)
  })

  it('the final discard (empty wall) cannot be claimed except to win', () => {
    let s = buildState({ hands: ['5m 123p 456p 789p 11s 99s', '46m 123s 456s 78s PP N', '55m 123p 456s 78s FF P', FILL_A], wallSize: 0 })
    s = applyAction(s, discardOf(s, 0, 4))
    expect(s.phase).toEqual({ kind: 'ended', result: { type: 'drawn' } })
  })

  it('random play with frequent claims keeps every invariant', () => {
    let claims = 0
    for (let seed = 1; seed <= 100; seed++) {
      playRandomHand(seed, {
        claimBias: 0.9,
        onState: (s, a) => {
          if (a.type === 'chow' || a.type === 'pung' || a.type === 'kong') claims++
          expectConservation(s)
          expectNoFlowersInHands(s)
          if (s.phase.kind === 'discard') expect(effectiveSize(s, s.turn)).toBe(14)
        },
      })
    }
    expect(claims).toBeGreaterThan(50)
  })
})
