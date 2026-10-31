import { describe, expect, it } from 'vitest'
import type { HandResult, Seat } from '@mahjong/engine'
import { handOutcome } from './outcome'

const score = { fans: [], total: 2, flowerPoints: 0 }
/** Singapore-style discard win: seat 2 wins off seat 1; seats 0 and 3 pay nothing, seat 0 earned bites. */
const win: HandResult = { type: 'win', winner: 2, from: 1, tileId: 0, score, deltas: [0, -4, 4, 0], bonus: [4, 0, 0, -4] }

describe('handOutcome', () => {
  it('reads the win deltas for the winner and the payer', () => {
    expect(handOutcome(win, 2)).toBe('win')
    expect(handOutcome(win, 1)).toBe('loss')
  })

  it('a win that costs you nothing is not a drawn hand', () => {
    for (const seat of [0, 3] as Seat[]) expect(handOutcome(win, seat)).toBe('other')
  })

  it('only an exhausted wall is a draw', () => {
    expect(handOutcome({ type: 'drawn' }, 0)).toBe('draw')
  })
})
