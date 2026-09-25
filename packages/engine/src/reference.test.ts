import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, meetsMinimum, settle, type Action, type Seat } from './index'
import { buildState, fanMap, playRandomHand, scoreNotation, type ScoreOptions } from './testing'
import { kindIndex } from './tiles'

/**
 * Reference hands with totals worked out by hand from the MCR rules (seat South, prevailing East,
 * discard win unless noted). The breakdown comment lists the fans behind each total.
 */
const REFERENCE: { name: string; hand: string; win: string; opts?: ScoreOptions; total: number }[] = [
  // pureStraight 16, allChows 2, concealedHand 2, singleWait 1
  { name: 'pure straight', hand: '123m 456m 789m 234p 55s', win: '5s', total: 21 },
  // pureStraight 16, allChows 2, fullyConcealedHand 4, singleWait 1
  { name: 'pure straight self-drawn', hand: '123m 456m 789m 234p 55s', win: '5s', opts: { selfDrawn: true }, total: 23 },
  // mixedStraight 8, allChows 2, concealedHand 2, singleWait 1
  { name: 'mixed straight', hand: '123m 456p 789s 234m 55s', win: '5s', total: 13 },
  // chickenHand 8
  { name: 'chicken hand', hand: '678s NN', win: '6s', opts: { melds: ['chow 234m', 'chow 567p', 'pung 222s'] }, total: 8 },
  // sevenPairs 24, allTypes 6
  { name: 'seven pairs', hand: '11m 33m 55p 77p 99s EE CC', win: 'C', total: 30 },
  { name: 'thirteen orphans', hand: '19m 19p 19s ESWN CFP 1m', win: '1m', total: 88 },
  // nineGates 88, twoConcealedPungs 2 (111m, 999m)
  { name: 'nine gates', hand: '1112345678999m 5m', win: '5m', total: 90 },
  // bigThreeDragons 88, threeConcealedPungs 16, concealedHand 2, singleWait 1, oneVoidedSuit 1
  { name: 'big three dragons', hand: 'CCC FFF PPP 234m 55p', win: '5p', total: 108 },
  // allPungs 6, twoConcealedPungs 2, pungOfTerminalsOrHonors 1 (999m), singleWait 1
  { name: 'all pungs, two open', hand: '777s 999m EE', win: 'E', opts: { melds: ['pung 222m', 'pung 555p'] }, total: 10 },
  // pureStraight 16, halfFlush 6, prevalentWind 2, concealedHand 2, singleWait 1
  { name: 'half flush straight', hand: '123m 456m 789m EEE SS', win: 'S', total: 27 },
  // + seatWind 2, fullyConcealedHand 4 instead of concealedHand 2
  { name: 'half flush straight, East seat, self-drawn', hand: '123m 456m 789m EEE SS', win: 'S', opts: { selfDrawn: true, seatWind: 'E' }, total: 31 },
  // meldedHand 6, prevalentWind 2
  { name: 'melded hand', hand: '99p', win: '9p', opts: { melds: ['chow 123m', 'pung 555p', 'chow 789s', 'pung EEE'] }, total: 8 },
  // knittedStraight 12, concealedHand 2, singleWait 1
  { name: 'knitted straight', hand: '147m 258p 369s 234s EE', win: 'E', total: 15 },
  { name: 'lesser honors and knitted', hand: '147m 258p 36s ESWNCF', win: 'F', total: 12 },
  // lesser 12, knittedStraight 12, selfDrawn 1
  { name: 'lesser honors with knitted straight, self-drawn', hand: '147m 258p 369s ESWNC', win: 'C', opts: { selfDrawn: true }, total: 25 },
  { name: 'greater honors and knitted', hand: '147m 258p 3s ESWNCFP', win: 'P', total: 24 },
  // allGreen 88, pureDoubleChow 1, twoConcealedPungs 2, concealedHand 2, singleWait 1
  { name: 'all green', hand: '234s 234s 666s 888s FF', win: 'F', total: 94 },
  // fourKongs 88, meldedHand 6, pungOfTerminalsOrHonors ×3 (1m, 9p, N)
  { name: 'four kongs', hand: 'EE', win: 'E', opts: { melds: ['kong 1111m', 'kong 9999p', 'kong 5555s', 'kong NNNN'] }, total: 97 },
  { name: 'seven shifted pairs', hand: '11223344556677m', win: '7m', total: 88 },
  // allTerminals 64, fourConcealedPungs 64, singleWait 1
  { name: 'all terminals', hand: '111m 999m 111p 999p 11s', win: '1s', total: 129 },
  // allEvenPungs 24, fourConcealedPungs 64 (waits 2p/3p, so no single wait)
  { name: 'all even pungs', hand: '222m 444p 666s 888m 22p', win: '2p', total: 88 },
  // pureShiftedChows 16, allChows 2, concealedHand 2, singleWait 1
  { name: 'pure shifted chows', hand: '123m 234m 345m 789p 55s', win: '5s', total: 21 },
  // allFives 16, concealedHand 2, singleWait 1
  { name: 'all fives', hand: '345m 456p 555s 567m 55p', win: '5p', total: 19 },
  // triplePung 16, threeConcealedPungs 16, concealedHand 2, noHonors 1 (waits 8p/9p)
  { name: 'triple pung', hand: '777m 777p 777s 123m 99p', win: '9p', total: 35 },
  // bigThreeWinds 12, prevalentWind 2, seatWind 2, threeConcealedPungs 16, concealedHand 2, singleWait 1, oneVoidedSuit 1
  { name: 'big three winds', hand: 'EEE SSS WWW 123m 55p', win: '5p', total: 36 },
  // littleFourWinds 64, prevalentWind 2, seatWind 2, threeConcealedPungs 16, halfFlush 6, outsideHand 4, concealedHand 2, edgeWait 1
  { name: 'little four winds', hand: 'EEE SSS WWW NN 123m', win: '3m', total: 97 },
  // pureStraight 16, lastTileDraw 8, fullyConcealedHand 4, allChows 2, singleWait 1
  { name: 'last tile draw', hand: '123m 456m 789m 234p 55s', win: '5s', opts: { selfDrawn: true, lastTileOfWall: true }, total: 31 },
  // pureStraight 16, robbingTheKong 8, concealedHand 2, allChows 2 (two-sided wait, last tile excluded)
  { name: 'robbing the kong', hand: '123m 456m 789m 234p 55s', win: '4p', opts: { robbingKong: true, winTileVisible: 3 }, total: 28 },
  // pureStraight 16, outWithReplacementTile 8, meldedKong 1, noHonors 1, singleWait 1
  { name: 'out with replacement tile', hand: '123m 456m 789m 55s', win: '5s', opts: { selfDrawn: true, replacement: true, melds: ['kong 2222p'] }, total: 27 },
  // mixedStraight 8, tileHog 2, pungOfTerminalsOrHonors 1, concealedHand 2, noHonors 1, singleWait 1
  { name: 'tile hog', hand: '111m 123m 456p 789s 55s', win: '5s', total: 15 },
  // mixedStraight 8, dragonPung 2, concealedHand 2, singleWait 1
  { name: 'dragon pung straight', hand: 'CCC 123m 456p 789s 55s', win: '5s', total: 13 },
  // mixedDoubleChow 1, pungOfTerminalsOrHonors 1, concealedHand 2, edgeWait 1 → below the minimum
  { name: 'too small (5)', hand: '123m 123p 567s 999s EE', win: '3m', total: 5 },
  // allChows 2, concealedHand 2, edgeWait 1 → below the minimum
  { name: 'too small (5, all chows)', hand: '123m 456p 678s 234s 55m', win: '3m', total: 5 },
]

describe('reference hands (V22)', () => {
  it('has at least 30 hands', () => expect(REFERENCE.length).toBeGreaterThanOrEqual(30))
  for (const r of REFERENCE) {
    it(`${r.name}: ${r.total}`, () => {
      const s = scoreNotation(r.hand, r.win, r.opts)
      expect(s, 'complete').not.toBeNull()
      expect(s!.total, JSON.stringify(fanMap(s))).toBe(r.total)
    })
  }
})

describe('8-fan minimum (V21)', () => {
  it('meetsMinimum ignores flowers', () => {
    const low = scoreNotation('123m 123p 567s 999s EE', '3m', { flowers: 4 })!
    expect(low.total).toBe(9)
    expect(meetsMinimum(low)).toBe(false)
    expect(meetsMinimum(scoreNotation('678s NN', '6s', { melds: ['chow 234m', 'chow 567p', 'pung 222s'] })!)).toBe(true)
  })

  it('a complete hand under 8 fan cannot declare a win', () => {
    let s = buildState({
      hands: ['3m 123p 456p 789p 1s 2s EE', '12m 123p 567s 999s EE', '19m 19p 19s FFF PPP C', '234s 678s 23m 89m 88p 3p'],
    })
    const discard: Action = { type: 'discard', seat: 0, tileId: s.hands[0]!.find((t) => kindIndex(t.kind) === 2)!.id }
    s = applyAction(s, discard)
    expect(legalActions(s, 1).map((a) => a.type)).not.toContain('win')
  })

  it('every win in random play meets the minimum', () => {
    let wins = 0
    for (let seed = 1; seed <= 150; seed++) {
      const { state } = playRandomHand(seed, { claimBias: 1 })
      if (state.phase.kind === 'ended' && state.phase.result.type === 'win') {
        wins++
        expect(meetsMinimum(state.phase.result.score)).toBe(true)
      }
    }
    expect(wins).toBeGreaterThan(0)
  })
})

describe('settle (V23)', () => {
  const score = (total: number) => ({ fans: [], total, flowerPoints: 0 })

  it('discard win: discarder pays 8 + fan, the others pay 8', () => {
    expect(settle({ winner: 2, from: 0 }, score(12))).toEqual([-20, -8, 36, -8])
  })

  it('self-draw: everyone pays 8 + fan', () => {
    expect(settle({ winner: 1, from: null }, score(10))).toEqual([-18, 54, -18, -18])
  })

  it('is zero-sum and records deltas on finished hands', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const { state } = playRandomHand(seed, { claimBias: 1 })
      if (state.phase.kind !== 'ended') continue
      const r = state.phase.result
      if (r.type === 'win') {
        expect(r.deltas.reduce((a, b) => a + b, 0)).toBe(0)
        expect(r.deltas).toEqual(settle({ winner: r.winner, from: r.from }, r.score))
      }
    }
    for (const winner of [0, 1, 2, 3] as Seat[]) {
      for (const from of [null, 0, 1, 2, 3] as (Seat | null)[]) {
        if (from === winner) continue
        expect(settle({ winner, from }, score(17)).reduce((a, b) => a + b, 0)).toBe(0)
      }
    }
  })
})
