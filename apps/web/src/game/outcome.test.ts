import { describe, expect, it } from 'vitest'
import type { HandResult, Seat } from '@mahjong/engine'
import { handOutcome } from './outcome'

const score = { fans: [], total: 2, flowerPoints: 0 }
/** A reported sg shooter-pays hand: seat 2 wins off seat 3's discard; seat 0 (you, +4 in bites) showed 荒庄. */
const win: HandResult = { type: 'win', winner: 2, from: 3, tileId: 76, score, deltas: [0, 0, 8, -8], bonus: [4, -4, -4, 4] }

describe('handOutcome', () => {
  it('reads the win deltas for the winner and the payer', () => {
    expect(handOutcome(win, 2)).toBe('win')
    expect(handOutcome(win, 3)).toBe('loss')
  })

  it('a win that costs you nothing is not a drawn hand', () => {
    for (const seat of [0, 1] as Seat[]) expect(handOutcome(win, seat)).toBe('other')
  })

  it('only an exhausted wall is a draw', () => {
    expect(handOutcome({ type: 'drawn' }, 0)).toBe('draw')
  })
})
