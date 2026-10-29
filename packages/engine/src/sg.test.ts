import { describe, expect, it } from 'vitest'
import {
  applyAction,
  bonusTileBites,
  createWall,
  fanDef,
  fansFor,
  handDeltas,
  isAnimal,
  isMatchOver,
  kindIndex,
  legalActions,
  mulberry32,
  newHand,
  newMatch,
  nextHand,
  paymentTable,
  settleSG,
  SG_FANS,
  sgBasePoints,
  STANDARD_HOUSE,
  viewFor,
  type GameState,
  type Match,
  type Seat,
  type SgFanId,
  type SgHouseRules,
} from './index'
import { buildState, expectConservation, fanMap, scoreNotationFor, type ScoreOptions } from './testing'

const sgHouse = (o: Partial<SgHouseRules>) => ({ rules: 'sg' as const, house: { ...STANDARD_HOUSE.sg, ...o } })
const sg = (hand: string, win: string, o: ScoreOptions = {}, house: Partial<SgHouseRules> = {}) => scoreNotationFor(sgHouse(house), hand, win, o)

type Case = { fans: Partial<Record<SgFanId, number>>; total: number; hand: string; win: string; opts?: ScoreOptions }

/** Seat South (own flower 2, season 6), prevailing East, no bonus tiles unless a case says otherwise. */
const CASES: Case[] = [
  // Ping Hu: four chows, a plain pair, a two-sided wait (23s waiting on 1s or 4s) and no bonus tiles.
  { hand: '123m 456p 789s 234s 55m', win: '4s', fans: { 'sg.allChows': 1 }, total: 4 },
  // Closed wait (2_4s), edge wait (12_s), a dragon pair or any bonus tile spoils it.
  { hand: '123m 456p 789s 234s 55m', win: '3s', fans: { 'sg.allChows': 0, 'sg.chickenHand': 1 }, total: 0 },
  { hand: '123m 456p 789s 123s 55m', win: '3s', fans: { 'sg.allChows': 0, 'sg.chickenHand': 1 }, total: 0 },
  { hand: '123m 456p 789s 234s CC', win: '4s', fans: { 'sg.allChows': 0 }, total: 0 },
  { hand: '123m 456p 789s 234s 55m', win: '4s', opts: { flowerNumbers: [3] }, fans: { 'sg.allChows': 0, 'sg.chickenHand': 1 }, total: 0 },
  // Own flowers and animals score 1 each.
  { hand: '123m 456p 789s 234s 55m', win: '4s', opts: { flowerNumbers: [2, 6, 3] }, fans: { 'sg.ownFlower': 2 }, total: 2 },
  { hand: '123m 456p 789s 234s 55m', win: '4s', opts: { flowerNumbers: [9, 10, 1] }, fans: { 'sg.animal': 2, 'sg.ownFlower': 0 }, total: 2 },
  { hand: '999p 55m', win: '5m', opts: { melds: ['pung 111m', 'pung 999s', 'pung 777s'] }, fans: { 'sg.allPungs': 1 }, total: 2 },
  { hand: '123m 456p CCC SSS 99s', win: '9s', fans: { 'sg.dragonPung': 1, 'sg.seatWind': 1 }, total: 2 },
  { hand: '123m 456m 789m EEE 22m', win: '2m', fans: { 'sg.halfFlush': 1, 'sg.prevailingWind': 1 }, total: 3 },
  // Full flush (4) + Ping Hu (4) = 8, capped at the 5-tai limit.
  { hand: '123m 456m 789m 234m 22m', win: '2m', fans: { 'sg.fullFlush': 1, 'sg.allChows': 1, 'sg.halfFlush': 0 }, total: 5 },
  { hand: 'CCC FFF PP 123m 456p', win: '6p', fans: { 'sg.smallDragons': 1, 'sg.dragonPung': 0 }, total: 4 },
  { hand: '11m 22m 55p 66p 88s 99s EE', win: 'E', fans: { 'sg.sevenPairs': 1 }, total: 4 },
  { hand: '123m 456p 789s 234s 55m', win: '4s', opts: { selfDrawn: true, replacement: true }, fans: { 'sg.allChows': 1, 'sg.kongReplacement': 1 }, total: 5 },
  // Limit hands score the limit and nothing else.
  { hand: 'CCC FFF PPP 123m 55p', win: '5p', fans: { 'sg.greatDragons': 1, 'sg.dragonPung': 0 }, total: 5 },
  { hand: 'EEE SSS WWW NN 555p', win: '5p', fans: { 'sg.smallWinds': 1, 'sg.allPungs': 0 }, total: 5 },
  { hand: '1m 9m 1p 9p 1s 9s E S W N C F P P', win: 'P', fans: { 'sg.thirteenOrphans': 1 }, total: 5 },
  { hand: 'EEE SSS WWW NNN CC', win: 'C', fans: { 'sg.allHonors': 1 }, total: 5 },
  { hand: '1112345678999m 5m', win: '5m', fans: { 'sg.nineGates': 1 }, total: 5 },
  { hand: '111m 555p 777s CCC 22s', win: '2s', fans: { 'sg.fourConcealedPungs': 1 }, total: 5 },
]

describe('Singapore scoring', () => {
  for (const c of CASES) {
    it(`${c.hand} + ${c.win} → ${c.total}`, () => {
      const score = sg(c.hand, c.win, c.opts)
      expect(score).not.toBeNull()
      const map = fanMap(score)
      for (const [id, count] of Object.entries(c.fans)) expect(map[id] ?? 0, id).toBe(count)
      expect(score!.total).toBe(c.total)
    })
  }

  it('rejects incomplete and knitted shapes', () => {
    expect(sg('123m 456p 789s 234s 56m', '6m')).toBeNull()
    expect(sg('147m 258p 369s ESWNCF', 'F')).toBeNull()
  })

  it('seven pairs wins by default and is rejected when the house rule is off', () => {
    expect(sg('11m 22m 55p 66p 88s 99s EE', 'E', {}, { sevenPairs: false })).toBeNull()
    expect(fansFor(sgHouse({ sevenPairs: false })).some((f) => f.id === 'sg.sevenPairs')).toBe(false)
  })

  it('caps the total at the house limit', () => {
    expect(sg('CCC FFF PPP 123m 55p', '5p', {}, { maxTai: 10 })!.total).toBe(10)
    expect(sg('123m 456m 789m 234m 22m', '2m', {}, { maxTai: 10 })!.total).toBe(8)
    expect(sg('123m 456m 789m 234m 22m', '2m', {}, { maxTai: 4 })!.total).toBe(4)
  })

  it('every element has a unique sg. id and both languages', () => {
    const ids = SG_FANS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of SG_FANS) {
      expect(f.id.startsWith('sg.')).toBe(true)
      expect(f.chinese && f.description.en && f.description.zh).toBeTruthy()
      expect(fanDef(f.id)).toBe(f)
    }
    // The standard table hides only the chicken hand.
    expect(fansFor({ rules: 'sg' }).map((f) => f.id)).toEqual(ids.filter((id) => id !== 'sg.chickenHand'))
    expect(fansFor(sgHouse({ minTai: 0, animals: false })).map((f) => f.id)).toEqual(ids.filter((id) => id !== 'sg.animal'))
  })
})

describe('Singapore payment', () => {
  it('doubles from 1 at 1 tai up to the limit; 0 tai pays as 1', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((t) => sgBasePoints(t))).toEqual([1, 1, 2, 4, 8, 16, 16])
    expect(sgBasePoints(10, STANDARD_HOUSE.sg)).toBe(16)
    expect(sgBasePoints(10, { ...STANDARD_HOUSE.sg, maxTai: 10 })).toBe(512)
    expect(paymentTable({ rules: 'sg' }).map((p) => [p.total, p.discarder, p.other, p.selfDraw])).toEqual([
      [1, 4, 0, 2],
      [2, 8, 0, 4],
      [3, 16, 0, 8],
      [4, 32, 0, 16],
      [5, 64, 0, 32],
    ])
  })

  it('the shooter pays for everyone by default; split has the discarder pay double; self-draw everyone double', () => {
    const score = { fans: [], total: 3, flowerPoints: 0 }
    expect(settleSG({ winner: 0, from: 2 }, score)).toEqual([16, 0, -16, 0])
    expect(settleSG({ winner: 0, from: 2 }, score, { ...STANDARD_HOUSE.sg, payment: 'split' })).toEqual([16, -4, -8, -4])
    expect(settleSG({ winner: 1, from: null }, score)).toEqual([-8, 24, -8, -8])
  })
})

/** Move the bonus tiles numbered `numbers` from the wall to `seat`'s flowers. */
function giveBonus(state: GameState, seat: Seat, numbers: number[]): void {
  for (const n of numbers) {
    const at = state.wall.findIndex((t) => t.kind.suit === 'flowers' && t.kind.flower === n)
    state.flowers[seat]!.push(state.wall.splice(at, 1)[0]!)
  }
}

const sumsToZero = (xs: number[]) => xs.reduce((a, b) => a + b, 0) === 0

describe('Singapore bites', () => {
  it('pays animal pairs, all four animals and complete flower sets once each', () => {
    const state = buildState({ rules: 'sg', hands: ['', '', '', ''] })
    giveBonus(state, 1, [9, 10, 1, 2, 3])
    bonusTileBites(state, 1)
    expect(state.bites).toEqual([{ seat: 1, kind: 'catMouse', units: 1, deltas: [-1, 3, -1, -1] }])
    bonusTileBites(state, 1)
    expect(state.bites).toHaveLength(1)
    giveBonus(state, 1, [11, 12, 4])
    bonusTileBites(state, 1)
    expect(state.bites!.map((b) => b.kind)).toEqual(['catMouse', 'roosterCentipede', 'allAnimals', 'flowerSet'])
    expect(state.bites!.at(-1)!.deltas).toEqual([-2, 6, -2, -2])
  })

  it('pays when a drawn animal completes a pair', () => {
    const ready = buildState({ rules: 'sg', hands: ['123m 456p 789s 23s', '', '', ''], wallBack: '9s', turn: 0, phase: { kind: 'draw' } })
    giveBonus(ready, 0, [9])
    const mouse = ready.wall.findIndex((t) => t.kind.suit === 'flowers' && t.kind.flower === 10)
    ready.wall.unshift(ready.wall.splice(mouse, 1)[0]!)
    const drawn = applyAction(ready, { type: 'draw', seat: 0 })
    expect(drawn.bites?.map((b) => [b.seat, b.kind])).toEqual([[0, 'catMouse']])
    expect(viewFor(drawn, 2).bites).toEqual(drawn.bites)
    expectConservation(drawn)
  })

  it('pays for kongs: 1 each for a melded kong, 2 each for a concealed kong', () => {
    const melded = buildState({ rules: 'sg', hands: ['5m', '555m 123p', '', ''], turn: 0 })
    const claim = applyAction(melded, { type: 'discard', seat: 0, tileId: melded.hands[0]![0]!.id })
    const kong = applyAction(claim, { type: 'kong', seat: 1 })
    expect(kong.bites![0]).toEqual({ seat: 1, kind: 'meldedKong', units: 1, deltas: [-1, 3, -1, -1] })

    const concealed = buildState({ rules: 'sg', hands: ['5555m 123p 456p 789s E', '', '', ''], wallBack: '9s', wallSize: 1 })
    const ids = concealed.hands[0]!.filter((t) => kindIndex(t.kind) === 4).map((t) => t.id)
    const after = applyAction(concealed, { type: 'kong', seat: 0, tileIds: ids })
    expect(after.bites).toEqual([{ seat: 0, kind: 'concealedKong', units: 2, deltas: [6, -2, -2, -2] }])

    // The wall is now empty: discarding ends the hand drawn, and the bite still stands.
    const east = after.hands[0]!.find((t) => kindIndex(t.kind) === 27)!
    const ended = applyAction(after, { type: 'discard', seat: 0, tileId: east.id })
    expect(ended.phase.kind === 'ended' && ended.phase.result).toEqual({ type: 'drawn', bonus: [6, -2, -2, -2] })
    if (ended.phase.kind === 'ended') expect(handDeltas(ended.phase.result)).toEqual([6, -2, -2, -2])
  })

  it('pays nothing with bites off, and other rule sets never bite', () => {
    const off = buildState({ rules: 'sg', house: { ...STANDARD_HOUSE.sg, bites: false }, hands: ['', '', '', ''] })
    giveBonus(off, 0, [9, 10, 11, 12])
    bonusTileBites(off, 0)
    expect(off.bites).toBeUndefined()
    const hk = buildState({ rules: 'hk', hands: ['', '', '', ''] })
    giveBonus(hk, 0, [1, 2, 3, 4])
    bonusTileBites(hk, 0)
    expect(hk.bites).toBeUndefined()
  })
})

describe('Singapore hands', () => {
  it('deals 148 tiles with animals, 144 without', () => {
    expect(createWall(true, true)).toHaveLength(148)
    const withAnimals = newHand({ seed: 5, dealer: 0, prevailingWind: 'E', rules: 'sg' })
    expectConservation(withAnimals)
    const without = newHand({ seed: 5, dealer: 0, prevailingWind: 'E', rules: 'sg', house: { ...STANDARD_HOUSE.sg, animals: false } })
    expectConservation(without)
    expect([...without.wall, ...without.flowers.flat()].some((t) => isAnimal(t.kind))).toBe(false)
  })

  it('a hand with no tai wins only when the minimum is 0', () => {
    const table = (house: Partial<SgHouseRules>) =>
      buildState({ rules: 'sg', house: { ...STANDARD_HOUSE.sg, ...house }, hands: ['3s', '123m 456p 789s 24s 55m', '', ''], turn: 0 })
    for (const [house, wins] of [
      [{}, false],
      [{ minTai: 0 as const }, true],
    ] as const) {
      const state = table(house)
      const after = applyAction(state, { type: 'discard', seat: 0, tileId: state.hands[0]![0]!.id })
      expect(legalActions(after, 1).some((a) => a.type === 'win')).toBe(wins)
    }
  })

  it('random matches keep every tile, sum to zero and never re-seat', () => {
    let wins = 0
    let bites = 0
    for (let seed = 1; seed <= 6; seed++) {
      const rand = mulberry32(seed)
      let match: Match = newMatch(seed, 'sg')
      while (!isMatchOver(match)) {
        expect(match.seating).toEqual([0, 1, 2, 3])
        let state = match.current!
        expect(state.rules).toBe('sg')
        while (state.phase.kind !== 'ended') {
          const seat = ([0, 1, 2, 3] as Seat[]).find((s) => legalActions(state, s).length > 0)!
          const legal = legalActions(state, seat)
          const win = legal.find((a) => a.type === 'win')
          const claims = legal.filter((a) => a.type !== 'pass' && a.type !== 'discard' && a.type !== 'draw')
          const pool = win ? [win] : claims.length > 0 ? claims : legal
          state = applyAction(state, pool[Math.floor(rand() * pool.length)]!)
          expectConservation(state)
        }
        const result = state.phase.result
        bites += state.bites?.length ?? 0
        for (const b of state.bites ?? []) expect(sumsToZero(b.deltas)).toBe(true)
        if (result.type === 'win') {
          wins++
          expect(result.score.total).toBeGreaterThanOrEqual(1)
          expect(result.score.total).toBeLessThanOrEqual(5)
          expect(sumsToZero(result.deltas)).toBe(true)
        }
        expect(sumsToZero(handDeltas(result))).toBe(true)
        match = nextHand(match, result)
      }
      expect(sumsToZero(match.scores)).toBe(true)
    }
    expect(wins).toBeGreaterThan(0)
    expect(bites).toBeGreaterThan(0)
  })
})
