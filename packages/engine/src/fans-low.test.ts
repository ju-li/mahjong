import { describe, expect, it } from 'vitest'
import type { FanId } from './index'
import { fanMap, scoreNotation, type ScoreOptions } from './testing'

type Case = { fan: FanId; hand: string; win: string; opts?: ScoreOptions; count?: number; not?: FanId[] }

/** Seat South, prevailing East unless a case says otherwise. */
const CASES: Case[] = [
  // 4
  { fan: 'outsideHand', hand: '123m 789p 111s EEE 99m', win: '9m' },
  { fan: 'fullyConcealedHand', hand: '123m 456p 789s 234s 55m', win: '5m', opts: { selfDrawn: true }, not: ['concealedHand', 'selfDrawn'] },
  { fan: 'twoMeldedKongs', hand: '345s 678s 99m', win: '9m', opts: { melds: ['kong 2222m', 'kong 7777p'] }, not: ['meldedKong'] },
  { fan: 'lastTile', hand: '123m 456p 789s 234s 55m', win: '4s', opts: { winTileVisible: 3 } },

  // 2
  { fan: 'dragonPung', hand: 'CCC 123m 456p 789s 55s', win: '5s', not: ['pungOfTerminalsOrHonors'] },
  { fan: 'prevalentWind', hand: 'EEE 123m 456p 789s 55m', win: '5m', not: ['seatWind', 'pungOfTerminalsOrHonors'] },
  { fan: 'seatWind', hand: 'SSS 123m 456p 789s 55m', win: '5m', not: ['prevalentWind', 'pungOfTerminalsOrHonors'] },
  { fan: 'concealedHand', hand: '123m 456p 789s 234s 55m', win: '4s', not: ['fullyConcealedHand', 'selfDrawn'] },
  { fan: 'allChows', hand: '123m 456m 234p 678s 55s', win: '4m', not: ['noHonors', 'singleWait'] },
  { fan: 'tileHog', hand: '111m 123m 456p 789s 55s', win: '5s' },
  { fan: 'doublePung', hand: '222m 222p 345s 678s 99m', win: '3s' },
  { fan: 'twoConcealedPungs', hand: '222m 555p 345s 678s 99m', win: '3s', not: ['threeConcealedPungs'] },
  { fan: 'concealedKong', hand: '345s 678s 123p 99m', win: '3s', opts: { melds: ['ckong 2222m'] } },
  { fan: 'allSimples', hand: '234m 456p 678s 345s 22p', win: '3s', not: ['noHonors'] },

  // 1
  { fan: 'pureDoubleChow', hand: '123m 123m 456p 789s EE', win: '3m' },
  { fan: 'mixedDoubleChow', hand: '123m 123p 567s 999s EE', win: '3m' },
  { fan: 'shortStraight', hand: '123m 456m 789p 111s EE', win: '3m' },
  { fan: 'twoTerminalChows', hand: '123m 789m 456p 222s EE', win: '3m' },
  { fan: 'pungOfTerminalsOrHonors', hand: '111m 999p NNN 234s 55s', win: '3s', count: 3 },
  { fan: 'meldedKong', hand: '345s 678s 123p 99m', win: '3s', opts: { melds: ['kong 2222m'] } },
  { fan: 'oneVoidedSuit', hand: '123m 456m 789p 234p EE', win: '3m', not: ['noHonors'] },
  { fan: 'noHonors', hand: '123m 456p 789s 222s 55m', win: '4p' },
  { fan: 'edgeWait', hand: '123m 456p 789s 234s 55m', win: '3m', not: ['closedWait', 'singleWait'] },
  { fan: 'closedWait', hand: '123m 456p 789s 234s 55m', win: '2m', not: ['edgeWait', 'singleWait'] },
  { fan: 'singleWait', hand: '123m 456p 789s 234s 55m', win: '5m', not: ['edgeWait', 'closedWait'] },
  { fan: 'selfDrawn', hand: '456p 789s 234s 55m', win: '4s', opts: { selfDrawn: true, melds: ['chow 123m'] }, not: ['fullyConcealedHand'] },
  { fan: 'flowerTiles', hand: '123m 456p 789s 234s 55m', win: '4s', opts: { flowers: 3 }, count: 3 },
]

describe('fans 4 → 1 and flowers', () => {
  for (const c of CASES) {
    it(c.fan, () => {
      const score = scoreNotation(c.hand, c.win, c.opts)
      expect(score, 'hand should be complete').not.toBeNull()
      const fans = fanMap(score)
      expect(fans, JSON.stringify(fans)).toHaveProperty(c.fan)
      if (c.count !== undefined) expect(fans[c.fan]).toBe(c.count)
      for (const x of c.not ?? []) expect(fans, `${x} should be absent: ${JSON.stringify(fans)}`).not.toHaveProperty(x)
    })
  }

  it('flowers count towards the total but not the 8-point minimum', () => {
    const s = scoreNotation('123m 456p 789s 234s 55m', '4s', { flowers: 3 })!
    expect(s.flowerPoints).toBe(3)
    expect(s.total).toBe(s.fans.reduce((v, f) => v + f.points * f.count, 0))
  })
})

describe('wait fans need a single winning kind', () => {
  it('no single wait when the hand also waited on another tile', () => {
    // 2345s waits on 2s and 5s; winning on 5s as the pair is not a single wait.
    const fans = fanMap(scoreNotation('123m 456p 2345s 5s', '5s', { melds: ['chow 789s'] }))
    expect(fans).not.toHaveProperty('singleWait')
  })

  it('no edge wait on a two-sided wait', () => {
    const fans = fanMap(scoreNotation('123m 456p 789s 234s 55m', '4s'))
    expect(fans).not.toHaveProperty('edgeWait')
    expect(fans).not.toHaveProperty('closedWait')
  })
})

describe('account-once principle', () => {
  it('three chows form at most two pair fans', () => {
    const fans = fanMap(scoreNotation('123m 123m 123p 789s EE', 'E'))
    const pairFans = (fans.pureDoubleChow ?? 0) + (fans.mixedDoubleChow ?? 0)
    expect(pairFans).toBe(2)
  })

  it('a straight plus a fourth chow adds one pair fan', () => {
    expect(fanMap(scoreNotation('123m 456m 789m 123p EE', 'E'))).toMatchObject({ pureStraight: 1, mixedDoubleChow: 1 })
    expect(fanMap(scoreNotation('123m 456m 789m 123m EE', 'E'))).toMatchObject({ pureStraight: 1, pureDoubleChow: 1 })
  })

  it('triple pung does not also count double pung', () => {
    const fans = fanMap(scoreNotation('777m 777p 777s 123m 99p', '9p'))
    expect(fans).toMatchObject({ triplePung: 1 })
    expect(fans).not.toHaveProperty('doublePung')
  })
})
