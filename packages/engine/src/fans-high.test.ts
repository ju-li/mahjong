import { describe, expect, it } from 'vitest'
import type { FanId } from './index'
import { fanMap, scoreNotation, type ScoreOptions } from './testing'

type Case = {
  fan: FanId
  hand: string
  win: string
  opts?: ScoreOptions
  /** Fans that must be absent (excluded by `fan` or simply not applicable). */
  not?: FanId[]
  /** Other fans that must also be present. */
  with?: FanId[]
}

/** Seat South, prevailing East unless a case says otherwise. */
const CASES: Case[] = [
  // 88
  { fan: 'bigFourWinds', hand: 'EEE SSS WWW NNN 11m', win: '1m', not: ['bigThreeWinds', 'littleFourWinds', 'allPungs', 'prevalentWind', 'seatWind', 'pungOfTerminalsOrHonors'], with: ['fourConcealedPungs', 'allTerminalsAndHonors'] },
  { fan: 'bigThreeDragons', hand: 'CCC FFF PPP 234m 55p', win: '5p', not: ['littleThreeDragons', 'twoDragonPungs', 'dragonPung'] },
  { fan: 'allGreen', hand: '234s 234s 666s 888s FF', win: 'F', not: ['halfFlush', 'oneVoidedSuit'] },
  { fan: 'nineGates', hand: '1112345678999m 5m', win: '5m', not: ['fullFlush', 'concealedHand', 'noHonors', 'oneVoidedSuit', 'pungOfTerminalsOrHonors'] },
  { fan: 'fourKongs', hand: 'EE', win: 'E', opts: { melds: ['kong 1111m', 'kong 9999p', 'kong 5555s', 'kong NNNN'] }, not: ['threeKongs', 'meldedKong', 'twoMeldedKongs', 'allPungs', 'singleWait'] },
  { fan: 'sevenShiftedPairs', hand: '11223344556677m', win: '7m', not: ['sevenPairs', 'fullFlush', 'concealedHand', 'singleWait', 'noHonors'] },
  { fan: 'thirteenOrphans', hand: '19m 19p 19s ESWN CFP 1m', win: '1m', not: ['allTerminalsAndHonors', 'allTypes', 'concealedHand', 'singleWait'] },

  // 64
  { fan: 'allTerminals', hand: '111m 999m 111p 999p 11s', win: '1s', not: ['allTerminalsAndHonors', 'allPungs', 'outsideHand', 'pungOfTerminalsOrHonors', 'noHonors', 'doublePung'], with: ['fourConcealedPungs'] },
  { fan: 'littleFourWinds', hand: 'EEE SSS WWW NN 123m', win: '3m', not: ['bigThreeWinds', 'bigFourWinds'] },
  { fan: 'littleThreeDragons', hand: 'CCC FFF PP 123m 456m', win: '6m', not: ['twoDragonPungs', 'dragonPung', 'bigThreeDragons'] },
  { fan: 'allHonors', hand: 'EEE SSS CCC FFF NN', win: 'N', not: ['allTerminalsAndHonors', 'allPungs', 'outsideHand', 'pungOfTerminalsOrHonors'] },
  { fan: 'fourConcealedPungs', hand: '222m 444m 666p 888s 55s', win: '8s', opts: { selfDrawn: true }, not: ['allPungs', 'threeConcealedPungs', 'twoConcealedPungs', 'concealedHand'] },
  { fan: 'pureTerminalChows', hand: '123m 123m 789m 789m 55m', win: '5m', not: ['fullFlush', 'pureDoubleChow', 'twoTerminalChows', 'allChows', 'sevenPairs'] },

  // 48
  { fan: 'quadrupleChow', hand: '123m 123m 123m 123m 55p', win: '5p', not: ['pureTripleChow', 'pureDoubleChow', 'tileHog', 'pureShiftedPungs'] },
  { fan: 'fourPureShiftedPungs', hand: '111m 222m 333m 444m 55p', win: '5p', not: ['pureShiftedPungs', 'pureTripleChow', 'allPungs'] },

  // 32
  { fan: 'fourPureShiftedChows', hand: '123m 234m 345m 456m 99p', win: '9p', not: ['pureShiftedChows', 'shortStraight', 'twoTerminalChows'] },
  { fan: 'threeKongs', hand: '345s EE', win: 'E', opts: { melds: ['kong 2222m', 'kong 5555p', 'kong 8888s'] }, not: ['meldedKong', 'twoMeldedKongs', 'fourKongs'] },
  { fan: 'allTerminalsAndHonors', hand: '111m 999p EEE CCC NN', win: 'N', not: ['allPungs', 'outsideHand', 'pungOfTerminalsOrHonors'] },

  // 24
  { fan: 'sevenPairs', hand: '11m 33m 55p 77p 99s EE CC', win: 'C', not: ['concealedHand', 'singleWait'] },
  { fan: 'greaterHonorsAndKnittedTiles', hand: '147m 258p 3s ESWNCFP', win: 'P', not: ['lesserHonorsAndKnittedTiles', 'allTypes', 'concealedHand'] },
  { fan: 'allEvenPungs', hand: '222m 444p 666s 888m 22p', win: '2p', not: ['allPungs', 'allSimples', 'noHonors'] },
  { fan: 'fullFlush', hand: '123m 345m 567m 789m 99m', win: '9m', not: ['noHonors', 'oneVoidedSuit'] },
  { fan: 'pureTripleChow', hand: '234m 567p 88s', win: '8s', opts: { melds: ['chow 234m', 'chow 234m'] }, not: ['pureDoubleChow', 'pureShiftedPungs'] },
  { fan: 'pureShiftedPungs', hand: '333p 444p 555p 789m 11s', win: '1s', not: ['pureTripleChow'] },
  { fan: 'upperTiles', hand: '789m 789p 999s 888s 77m', win: '7m', not: ['upperFour', 'noHonors'] },
  { fan: 'middleTiles', hand: '456m 456p 456s 666m 44s', win: '4s', not: ['allSimples', 'noHonors'] },
  { fan: 'lowerTiles', hand: '123m 123p 123s 333m 22p', win: '2p', not: ['lowerFour', 'noHonors'] },

  // 16
  { fan: 'pureStraight', hand: '123m 456m 789m 234p 55s', win: '5s', not: ['shortStraight', 'twoTerminalChows'] },
  { fan: 'threeSuitedTerminalChows', hand: '123m 789m 123p 789p 55s', win: '5s', not: ['mixedDoubleChow', 'twoTerminalChows', 'allChows', 'noHonors'] },
  { fan: 'pureShiftedChows', hand: '123m 234m 345m 789p 55s', win: '5s' },
  { fan: 'allFives', hand: '345m 456p 555s 567m 55p', win: '5p', not: ['allSimples', 'noHonors'] },
  { fan: 'triplePung', hand: '777m 777p 777s 123m 99p', win: '9p', not: ['doublePung'] },
  { fan: 'threeConcealedPungs', hand: '222m 555p 888s 345m 99p', win: '3m', not: ['twoConcealedPungs'] },

  // 12
  { fan: 'lesserHonorsAndKnittedTiles', hand: '147m 258p 36s ESWNCF', win: 'F', not: ['allTypes', 'concealedHand', 'knittedStraight'] },
  { fan: 'knittedStraight', hand: '147m 258p 369s 234s EE', win: 'E' },
  { fan: 'upperFour', hand: '678m 789p 666s 999m 77s', win: '7s', not: ['upperTiles', 'noHonors'] },
  { fan: 'lowerFour', hand: '123m 234p 444s 111m 22s', win: '2s', not: ['lowerTiles', 'noHonors'] },
  { fan: 'bigThreeWinds', hand: 'EEE SSS WWW 123m 55p', win: '5p', not: ['pungOfTerminalsOrHonors'], with: ['prevalentWind', 'seatWind'] },

  // 8
  { fan: 'mixedStraight', hand: '123m 456p 789s 234m 55s', win: '5s' },
  { fan: 'reversibleTiles', hand: '123p 345p 456s 888s PP', win: 'P', not: ['oneVoidedSuit'] },
  { fan: 'mixedTripleChow', hand: '234m 234p 234s 567m 88p', win: '8p', not: ['mixedDoubleChow'] },
  { fan: 'mixedShiftedPungs', hand: '333m 444p 555s 789m 11p', win: '1p' },
  { fan: 'lastTileDraw', hand: '123m 456m 789m 234p 55s', win: '5s', opts: { selfDrawn: true, lastTileOfWall: true }, not: ['selfDrawn', 'lastTileClaim'] },
  { fan: 'lastTileClaim', hand: '123m 456m 789m 234p 55s', win: '5s', opts: { lastTileOfWall: true }, not: ['lastTileDraw'] },
  { fan: 'outWithReplacementTile', hand: '123m 456m 789m 55s', win: '5s', opts: { selfDrawn: true, replacement: true, melds: ['kong 2222p'] }, not: ['selfDrawn'] },
  { fan: 'robbingTheKong', hand: '123m 456m 789m 234p 55s', win: '4p', opts: { robbingKong: true, winTileVisible: 3 }, not: ['lastTile'] },

  // 6
  { fan: 'allPungs', hand: '777s 999m EE', win: 'E', opts: { melds: ['pung 222m', 'pung 555p'] } },
  { fan: 'halfFlush', hand: '123m 456m 789m EEE SS', win: 'S' },
  { fan: 'mixedShiftedChows', hand: '123m 234p 345s 789m 55p', win: '5p' },
  { fan: 'allTypes', hand: '123m 456p 789s EEE CC', win: 'C' },
  { fan: 'meldedHand', hand: '99p', win: '9p', opts: { melds: ['chow 123m', 'pung 555p', 'chow 789s', 'pung EEE'] }, not: ['singleWait'] },
  { fan: 'twoConcealedKongs', hand: '789s 345m EE', win: 'E', opts: { melds: ['ckong 2222m', 'ckong 5555p'] }, not: ['concealedKong', 'twoConcealedPungs'] },
  { fan: 'twoDragonPungs', hand: 'CCC FFF 123m 456p 99s', win: '9s', not: ['dragonPung'] },
]

describe('fans 88 → 6', () => {
  for (const c of CASES) {
    it(c.fan, () => {
      const score = scoreNotation(c.hand, c.win, c.opts)
      expect(score, 'hand should be complete').not.toBeNull()
      const fans = fanMap(score)
      expect(fans, JSON.stringify(fans)).toHaveProperty(c.fan)
      for (const x of c.not ?? []) expect(fans, `${x} should be absent: ${JSON.stringify(fans)}`).not.toHaveProperty(x)
      for (const x of c.with ?? []) expect(fans, `${x} should be present: ${JSON.stringify(fans)}`).toHaveProperty(x)
    })
  }
})

describe('arrangement choice', () => {
  it('reads 222333444m as pungs when that scores more (concealed)', () => {
    const fans = fanMap(scoreNotation('234m 234m 234m 567p 88s', '8s'))
    expect(fans).toHaveProperty('pureShiftedPungs')
    expect(fans).not.toHaveProperty('pureTripleChow')
  })
})
