import { describe, expect, it } from 'vitest'
import data from './fixtures/reference-gb.json'
import { scoreHand, type ScoringMeld, type Wind } from './index'

/**
 * Hands scored by an independent reference calculator (see `data.source`): PyMahjongGB, the
 * fan calculator used by Botzone's Chinese Standard Mahjong competitions, which wraps
 * summerinsects' ChineseOfficialMahjongHelper. Totals must match exactly (V30).
 *
 * Tile codes: W = characters, B = dots, T = bamboo, F1–F4 = E S W N, J1–J3 = red green white.
 */
function kind(code: string): number {
  const n = Number(code.slice(1))
  switch (code[0]) {
    case 'W':
      return n - 1
    case 'B':
      return 9 + n - 1
    case 'T':
      return 18 + n - 1
    case 'F':
      return 27 + n - 1
    case 'J':
      return 31 + n - 1
    default:
      throw new Error(`bad tile code ${code}`)
  }
}

type Fixture = (typeof data.hands)[number]

function score(h: Fixture) {
  const melds: ScoringMeld[] = h.melds.map(([type, tile, exposed]) => ({
    type: type as ScoringMeld['type'],
    index: kind(tile as string),
    exposed: exposed as boolean,
  }))
  return scoreHand({
    concealed: h.hand.split(' ').map(kind),
    melds,
    winTile: kind(h.win),
    selfDrawn: h.selfDrawn,
    seatWind: h.seatWind as Wind,
    prevailingWind: h.prevailingWind as Wind,
    flowers: h.flowers,
    lastTileOfWall: h.lastTileOfWall,
    replacement: h.replacement,
    robbingKong: h.robbingKong,
    winTileVisible: h.winTileVisible,
  })
}

describe(`reference calculator hands (${data.source})`, () => {
  it('has at least 20 externally scored hands', () => {
    expect(data.hands.length).toBeGreaterThanOrEqual(20)
  })

  it('matches every reference total', () => {
    const wrong: string[] = []
    for (const h of data.hands) {
      const s = score(h)
      if (!s || s.total !== h.total) {
        wrong.push(`${h.hand} win ${h.win} melds ${JSON.stringify(h.melds)}: engine ${s?.total} vs ${h.total} ${JSON.stringify(h.fans)}`)
      }
    }
    expect(wrong, wrong.slice(0, 5).join('\n')).toEqual([])
  })
})
