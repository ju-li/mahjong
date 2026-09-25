import { describe, expect, it } from 'vitest'
import {
  applyAction,
  fanDef,
  fansFor,
  hkBasePoints,
  HK_FANS,
  isMatchOver,
  legalActions,
  mulberry32,
  newMatch,
  nextHand,
  settleHK,
  viewFor,
  type HkFanId,
  type Match,
  type Seat,
} from './index'
import { buildState, expectConservation, fanMap, scoreNotationFor, type ScoreOptions } from './testing'

const hk = (hand: string, win: string, o: ScoreOptions = {}) => scoreNotationFor('hk', hand, win, o)

type Case = { fans: Partial<Record<HkFanId, number>>; total: number; hand: string; win: string; opts?: ScoreOptions }

/** Seat South, prevailing East, no flowers (so No Flowers 1) unless a case says otherwise. */
const CASES: Case[] = [
  { hand: '123m 456p 789s 234s 55m', win: '4s', fans: { 'hk.allChows': 1, 'hk.concealedHand': 1, 'hk.noFlowers': 1 }, total: 3 },
  { hand: '123m 456p 789s 234s 55m', win: '4s', opts: { selfDrawn: true }, fans: { 'hk.allChows': 1, 'hk.concealedHand': 1, 'hk.selfDrawn': 1, 'hk.noFlowers': 1 }, total: 4 },
  { hand: '234s 55m', win: '4s', opts: { melds: ['pung 111m', 'pung 999p', 'pung 777s'] }, fans: { 'hk.noFlowers': 1 }, total: 1 },
  { hand: '999p 55m', win: '5m', opts: { melds: ['pung 111m', 'pung 999s', 'pung 777s'] }, fans: { 'hk.allPungs': 1, 'hk.noFlowers': 1 }, total: 4 },
  { hand: '123m 456m 789m EEE 22m', win: '2m', fans: { 'hk.halfFlush': 1, 'hk.prevailingWind': 1, 'hk.concealedHand': 1, 'hk.noFlowers': 1 }, total: 6 },
  { hand: '123m 456m 789m 234m 22m', win: '2m', fans: { 'hk.fullFlush': 1, 'hk.concealedHand': 1, 'hk.allChows': 1, 'hk.noFlowers': 1 }, total: 10 },
  { hand: 'CCC FFF PP 123m 456p', win: '6p', fans: { 'hk.smallDragons': 1, 'hk.concealedHand': 1, 'hk.noFlowers': 1 }, total: 7 },
  { hand: 'CCC FFF PPP 123m 55p', win: '5p', fans: { 'hk.greatDragons': 1, 'hk.concealedHand': 1, 'hk.noFlowers': 1 }, total: 10 },
  { hand: 'EEE SSS WWW NN 555p', win: '5p', fans: { 'hk.smallWinds': 1, 'hk.seatWind': 0, 'hk.halfFlush': 1, 'hk.allPungs': 1 }, total: 13 },
  { hand: '11m 22m 55p 66p 88s 99s EE', win: 'E', fans: { 'hk.sevenPairs': 1, 'hk.noFlowers': 1 }, total: 5 },
  { hand: '1m 9m 1p 9p 1s 9s E S W N C F P P', win: 'P', fans: { 'hk.thirteenOrphans': 1 }, total: 13 },
  { hand: 'EEE SSS WWW NNN CC', win: 'C', fans: { 'hk.allHonors': 1 }, total: 13 },
  { hand: '111m 999m 111p 999p 11s', win: '1s', opts: { selfDrawn: true }, fans: { 'hk.allTerminals': 1 }, total: 13 },
  { hand: '1112345678999m 5m', win: '5m', fans: { 'hk.nineGates': 1 }, total: 13 },
  { hand: '111m 555p 777s CCC 22s', win: '2s', fans: { 'hk.fourConcealedPungs': 1 }, total: 13 },
  // Own flowers: seat South owns flower 2 and season 6.
  { hand: '123m 456p 789s 234s 55m', win: '4s', opts: { flowerNumbers: [2, 6, 3] }, fans: { 'hk.allChows': 1, 'hk.concealedHand': 1, 'hk.ownFlower': 2 }, total: 4 },
  { hand: '123m 456p 789s 234s 55m', win: '4s', opts: { flowerNumbers: [1, 2, 3, 4] }, fans: { 'hk.allChows': 1, 'hk.concealedHand': 1, 'hk.ownFlower': 1, 'hk.flowerSet': 1 }, total: 5 },
  // Won on a discard, the pung completed by that tile is not concealed.
  { hand: '111m 555p 777s CC 222s', win: '2s', fans: { 'hk.allPungs': 1, 'hk.dragonPung': 0, 'hk.concealedHand': 1, 'hk.noFlowers': 1 }, total: 5 },
  { hand: '111m 555p 777s 22s CCC', win: 'C', fans: { 'hk.allPungs': 1, 'hk.dragonPung': 1, 'hk.concealedHand': 1, 'hk.noFlowers': 1 }, total: 6 },
]

describe('Hong Kong scoring', () => {
  for (const c of CASES) {
    it(`${c.hand} + ${c.win} → ${c.total}`, () => {
      const score = hk(c.hand, c.win, c.opts)
      expect(score).not.toBeNull()
      const map = fanMap(score)
      for (const [id, count] of Object.entries(c.fans)) expect(map[id] ?? 0, id).toBe(count)
      expect(score!.total).toBe(c.total)
    })
  }

  it('rejects incomplete and knitted shapes', () => {
    expect(hk('123m 456p 789s 234s 56m', '6m')).toBeNull()
    expect(hk('147m 258p 369s ESWNCF', 'F')).toBeNull()
  })

  it('caps the total at 13', () => {
    expect(hk('EEE SSS WWW NNN CC', 'C', { flowerNumbers: [1, 2, 3, 4, 5, 6, 7, 8] })!.total).toBe(13)
  })

  it('every element has a unique hk. id and both languages', () => {
    const ids = HK_FANS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of HK_FANS) {
      expect(f.id.startsWith('hk.')).toBe(true)
      expect(f.chinese && f.description.en && f.description.zh).toBeTruthy()
      expect(fanDef(f.id)).toBe(f)
    }
    expect(fansFor('hk')).toBe(HK_FANS)
    expect(fanDef('allGreen')?.points).toBe(88)
  })
})

describe('Hong Kong payment', () => {
  it('uses the half-spicy table', () => {
    expect([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(hkBasePoints)).toEqual([8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384])
    expect(hkBasePoints(20)).toBe(384)
  })

  it('discarder pays double, others single; self-draw everyone double', () => {
    const score = { fans: [], total: 3, flowerPoints: 0 }
    expect(settleHK({ winner: 0, from: 2 }, score)).toEqual([32, -8, -16, -8])
    expect(settleHK({ winner: 1, from: null }, score)).toEqual([-16, 48, -16, -16])
  })
})

describe('Hong Kong hands', () => {
  it('a 3-faan hand may win on a discard, a 1-faan hand may not', () => {
    // Seat 1 waits on 4s with a concealed common hand (3 faan).
    const ready = buildState({
      rules: 'hk',
      hands: ['4s', '123m 456p 789s 23s 55m', '', ''],
      turn: 0,
      phase: { kind: 'discard', drawnTileId: null, afterKong: false },
    })
    const tile = ready.hands[0]![0]!
    const after = applyAction(ready, { type: 'discard', seat: 0, tileId: tile.id })
    expect(legalActions(after, 1).some((a) => a.type === 'win')).toBe(true)
    const won = applyAction(after, { type: 'win', seat: 1 })
    expect(won.phase.kind === 'ended' && won.phase.result.type === 'win' && won.phase.result.deltas).toEqual([-16, 32, -8, -8])

    const cheap = buildState({
      rules: 'hk',
      hands: ['4s', '23s 55m', '', ''],
      melds: [
        { seat: 1, type: 'pung', tiles: '111m' },
        { seat: 1, type: 'pung', tiles: '999p' },
        { seat: 1, type: 'pung', tiles: '777s' },
      ],
      turn: 0,
      phase: { kind: 'discard', drawnTileId: null, afterKong: false },
    })
    const next = applyAction(cheap, { type: 'discard', seat: 0, tileId: cheap.hands[0]![0]!.id })
    expect(legalActions(next, 1).some((a) => a.type === 'win')).toBe(false)
  })

  it('views carry the rule set', () => {
    const m = newMatch(3, 'hk')
    expect(m.rules).toBe('hk')
    expect(viewFor(m.current!, 0).rules).toBe('hk')
  })

  it('random matches keep every tile, sum to zero and never re-seat', () => {
    let wins = 0
    for (let seed = 1; seed <= 6; seed++) {
      const rand = mulberry32(seed)
      let match: Match = newMatch(seed, 'hk')
      while (!isMatchOver(match)) {
        expect(match.seating).toEqual([0, 1, 2, 3])
        let state = match.current!
        expect(state.rules).toBe('hk')
        while (state.phase.kind !== 'ended') {
          const seat = ([0, 1, 2, 3] as Seat[]).find((s) => legalActions(state, s).length > 0)!
          const legal = legalActions(state, seat)
          const win = legal.find((a) => a.type === 'win')
          const claims = legal.filter((a) => a.type !== 'pass' && a.type !== 'discard' && a.type !== 'draw')
          const pool = win ? [win] : claims.length > 0 ? claims : legal
          state = applyAction(state, pool[Math.floor(rand() * pool.length)]!)
          expectConservation(state)
        }
        if (state.phase.result.type === 'win') {
          wins++
          expect(state.phase.result.score.total).toBeGreaterThanOrEqual(3)
          expect(state.phase.result.deltas.reduce((a, b) => a + b, 0)).toBe(0)
        }
        match = nextHand(match, state.phase.result)
      }
      expect(match.scores.reduce((a, b) => a + b, 0)).toBe(0)
    }
    expect(wins).toBeGreaterThan(0)
  })
})
