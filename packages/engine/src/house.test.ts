import { describe, expect, it } from 'vitest'
import {
  applyAction,
  fansFor,
  HOUSE_OPTIONS,
  houseDiff,
  houseKeys,
  isFlower,
  isMatchOver,
  isStandard,
  legalActions,
  meetsMinimumFor,
  minimumFor,
  mulberry32,
  newHand,
  newMatch,
  nextHand,
  normalizeHouseRules,
  paymentFor,
  paymentTable,
  settleFor,
  STANDARD_HOUSE,
  viewFor,
  withHouse,
  type HkHouseRules,
  type Match,
  type RuleConfig,
  type Seat,
} from './index'
import { buildState, expectConservation, fanMap, scoreNotationFor, type ScoreOptions } from './testing'

const hkHouse = (o: Partial<HkHouseRules>): RuleConfig => ({ rules: 'hk', house: { ...STANDARD_HOUSE.hk, ...o } })
const hk = (o: Partial<HkHouseRules>, hand: string, win: string, opts: ScoreOptions = {}) => scoreNotationFor(hkHouse(o), hand, win, opts)

describe('normalizeHouseRules', () => {
  it('fills the standard for missing, unknown and out-of-range values', () => {
    expect(normalizeHouseRules('hk', undefined)).toEqual(STANDARD_HOUSE.hk)
    expect(normalizeHouseRules('hk', 'junk')).toEqual(STANDARD_HOUSE.hk)
    expect(normalizeHouseRules('hk', { kongFaan: 'each1', minFaan: 2, maxFaan: '8', extra: 1 })).toEqual({ ...STANDARD_HOUSE.hk, kongFaan: 'each1' })
    expect(normalizeHouseRules('mcr', { minFan: 4, flowers: false, kongFaan: 'each1' })).toEqual({ minFan: 4, flowers: false })
  })

  it('keeps every listed value of every option', () => {
    for (const rules of ['mcr', 'hk'] as const) {
      for (const key of houseKeys(rules)) {
        for (const value of (HOUSE_OPTIONS[rules] as Record<string, readonly unknown[]>)[key]!) {
          expect((normalizeHouseRules(rules, { [key]: value }) as Record<string, unknown>)[key]).toBe(value)
        }
      }
      expect(Object.keys(STANDARD_HOUSE[rules]).sort()).toEqual([...houseKeys(rules)].sort())
    }
  })
})

describe('houseDiff', () => {
  it('lists only the options that differ, in question order', () => {
    expect(isStandard({ rules: 'hk' })).toBe(true)
    expect(isStandard({ rules: 'hk', house: STANDARD_HOUSE.hk })).toBe(true)
    const diff = houseDiff(hkHouse({ payment: 'full', kongFaan: 'each1' }))
    expect(diff).toEqual([
      { key: 'kongFaan', value: 'each1', standard: 'none' },
      { key: 'payment', value: 'full', standard: 'half' },
    ])
    expect(isStandard({ rules: 'mcr', house: { minFan: 0, flowers: true } })).toBe(false)
  })
})

describe('Hong Kong kong faan', () => {
  const opts: ScoreOptions = { melds: ['kong 111m', 'ckong 999p'] }
  const hand = '123s 456s 55m'

  it('gives nothing on the standard table', () => {
    const map = fanMap(hk({}, hand, '6s', opts))
    expect(map['hk.meldedKong']).toBeUndefined()
    expect(map['hk.concealedKong']).toBeUndefined()
  })

  it('adds 1 per kong', () => {
    const base = hk({}, hand, '6s', opts)!.total
    const score = hk({ kongFaan: 'each1' }, hand, '6s', opts)!
    expect(fanMap(score)).toMatchObject({ 'hk.meldedKong': 1, 'hk.concealedKong': 1 })
    expect(score.total).toBe(base + 2)
  })

  it('adds 1 per melded and 2 per concealed kong', () => {
    const base = hk({}, hand, '6s', opts)!.total
    const score = hk({ kongFaan: 'melded1concealed2' }, hand, '6s', opts)!
    expect(score.fans.find((f) => f.id === 'hk.concealedKong')!.points).toBe(2)
    expect(score.total).toBe(base + 3)
  })

  it('leaves limit hands at the limit', () => {
    const score = hk({ kongFaan: 'each1' }, '55m', '5m', { melds: ['kong 111m', 'kong 999p', 'ckong 777s', 'kong 222s'] })!
    expect(score.fans.map((f) => f.id)).toEqual(['hk.fourKongs'])
    expect(score.total).toBe(13)
  })

  it('counts towards the minimum', () => {
    // 1 faan (no flowers) + 2 kongs = 3: enough to win only with kong faan.
    const melds = ['kong 111m', 'kong 999p', 'pung 777s']
    const plain = hk({}, '234s 55m', '4s', { melds })!
    const withKongs = hk({ kongFaan: 'each1' }, '234s 55m', '4s', { melds })!
    expect(plain.total).toBe(1)
    expect(withKongs.total).toBe(3)
  })
})

describe('Hong Kong limits, minimum and chicken hand', () => {
  it('caps at the chosen limit and scores limit hands at it', () => {
    expect(hk({ maxFaan: 8 }, '123m 456m 789m 234m 22m', '2m')!.total).toBe(8)
    expect(hk({ maxFaan: 10 }, 'EEE SSS WWW NNN CC', 'C')!.total).toBe(10)
  })

  it('chicken hand wins only with no minimum', () => {
    const chicken = hk({ minFaan: 0, flowers: false }, '234s 55m', '4s', { melds: ['pung 111m', 'pung 999p', 'pung 777s'] })!
    expect(chicken.fans.map((f) => f.id)).toEqual(['hk.chickenHand'])
    expect(chicken.total).toBe(0)
    expect(minimumFor(hkHouse({ minFaan: 0 }))).toBe(0)
    expect(minimumFor({ rules: 'hk' })).toBe(3)
  })

  it('a 1-faan hand wins on a discard with minimum 1', () => {
    const state = buildState({
      rules: 'hk',
      house: { ...STANDARD_HOUSE.hk, minFaan: 1 },
      hands: ['4s', '23s 55m', '', ''],
      melds: [
        { seat: 1, type: 'pung', tiles: '111m' },
        { seat: 1, type: 'pung', tiles: '999p' },
        { seat: 1, type: 'pung', tiles: '777s' },
      ],
      turn: 0,
    })
    const next = applyAction(state, { type: 'discard', seat: 0, tileId: state.hands[0]![0]!.id })
    expect(legalActions(next, 1).some((a) => a.type === 'win')).toBe(true)
  })
})

describe('Hong Kong payment options', () => {
  const score = { fans: [], total: 5, flowerPoints: 0 }

  it('full-shoot: the discarder pays everything', () => {
    expect(settleFor(hkHouse({ payment: 'full' }), { winner: 0, from: 2 }, score)).toEqual([96, 0, -96, 0])
    expect(settleFor(hkHouse({}), { winner: 0, from: 2 }, score)).toEqual([96, -24, -48, -24])
  })

  it('self-draw pays the same either way', () => {
    expect(settleFor(hkHouse({ payment: 'full' }), { winner: 1, from: null }, score)).toEqual(settleFor(hkHouse({}), { winner: 1, from: null }, score))
  })

  it('full-spicy doubles every faan', () => {
    expect(paymentTable(hkHouse({ curve: 'full' })).map((p) => p.base)).toEqual([8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192])
    expect(paymentTable(hkHouse({ curve: 'full', minFaan: 0, maxFaan: 8 })).map((p) => p.base)).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256])
  })

  it('payment table matches settlement', () => {
    for (const config of [hkHouse({}), hkHouse({ payment: 'full', curve: 'full' }), { rules: 'mcr' } as RuleConfig]) {
      for (const row of paymentTable(config)) {
        const s = { fans: [], total: row.total, flowerPoints: 0 }
        const discard = settleFor(config, { winner: 0, from: 1 }, s)
        expect([0 - discard[1]!, 0 - discard[2]!]).toEqual([row.discarder, row.other])
        expect(-settleFor(config, { winner: 0, from: null }, s)[3]!).toBe(row.selfDraw)
      }
    }
    expect(paymentFor({ rules: 'mcr' }, 10)).toEqual({ total: 10, base: 8, discarder: 18, other: 8, selfDraw: 18 })
  })
})

describe('flowers off', () => {
  it('deals a 136-tile set with no flower faan', () => {
    for (const rules of ['mcr', 'hk'] as const) {
      const state = newHand({ seed: 7, dealer: 0, prevailingWind: 'E', rules, house: { ...STANDARD_HOUSE[rules], flowers: false } })
      expectConservation(state)
      expect([...state.wall, ...state.hands.flat()].some((t) => isFlower(t.kind))).toBe(false)
      expect(state.flowers.flat()).toEqual([])
    }
    expect(fansFor(hkHouse({ flowers: false })).some((f) => f.id === 'hk.noFlowers')).toBe(false)
    expect(fansFor({ rules: 'mcr', house: { minFan: 8, flowers: false } }).some((f) => f.id === 'flowerTiles')).toBe(false)
    const score = hk({ flowers: false }, '123m 456p 789s 234s 55m', '4s')!
    expect(fanMap(score)['hk.noFlowers']).toBeUndefined()
    expect(score.flowerPoints).toBe(0)
  })
})

describe('MCR casual minimum', () => {
  it('lets a small hand win with a lower minimum; flowers still do not count', () => {
    const small = { fans: [], total: 6, flowerPoints: 2 }
    expect(meetsMinimumFor({ rules: 'mcr' }, small)).toBe(false)
    expect(meetsMinimumFor({ rules: 'mcr', house: { minFan: 4, flowers: true } }, small)).toBe(true)
    expect(meetsMinimumFor({ rules: 'mcr', house: { minFan: 4, flowers: true } }, { ...small, flowerPoints: 3 })).toBe(false)
    expect(minimumFor({ rules: 'mcr', house: { minFan: 0, flowers: true } })).toBe(0)
    expect(minimumFor({ rules: 'mcr' })).toBe(8)
  })
})

describe('house rules in a match', () => {
  it('reach every hand and every view, and can change from the next hand', () => {
    const house = { ...STANDARD_HOUSE.hk, kongFaan: 'each1' as const, payment: 'full' as const }
    let match: Match = newMatch(5, { rules: 'hk', house })
    expect(match.current!.house).toEqual(house)
    expect(viewFor(match.current!, 2).house).toEqual(house)

    const changed = { ...house, maxFaan: 8 as const }
    match = withHouse(match, changed)
    expect(match.current!.house).toEqual(house) // the hand in progress keeps its rules
    match = nextHand(match, { type: 'drawn' })
    expect(match.history[0]!.house).toEqual(house)
    expect(match.current!.house).toEqual(changed)
    expect(withHouse(match, { minFaan: 'bad' }).house).toEqual(STANDARD_HOUSE.hk)
  })

  it('random flowerless full-shoot matches keep every tile and sum to zero', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const rand = mulberry32(seed)
      let match: Match = newMatch(seed, { rules: 'hk', house: { ...STANDARD_HOUSE.hk, flowers: false, payment: 'full', minFaan: 0, kongFaan: 'melded1concealed2' } })
      while (!isMatchOver(match)) {
        let state = match.current!
        while (state.phase.kind !== 'ended') {
          const seat = ([0, 1, 2, 3] as Seat[]).find((s) => legalActions(state, s).length > 0)!
          const legal = legalActions(state, seat)
          const win = legal.find((a) => a.type === 'win')
          const claims = legal.filter((a) => a.type !== 'pass' && a.type !== 'discard' && a.type !== 'draw')
          const pool = win ? [win] : claims.length > 0 ? claims : legal
          state = applyAction(state, pool[Math.floor(rand() * pool.length)]!)
          expectConservation(state)
        }
        if (state.phase.result.type === 'win') expect(state.phase.result.deltas.reduce((a, b) => a + b, 0)).toBe(0)
        match = nextHand(match, state.phase.result)
      }
      expect(match.scores.reduce((a, b) => a + b, 0)).toBe(0)
    }
  })
})
