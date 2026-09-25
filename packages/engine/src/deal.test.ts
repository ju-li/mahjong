import { describe, expect, it } from 'vitest'
import { newHand, seatWind, type Seat } from './index'
import { effectiveSize, expectConservation, expectNoFlowersInHands } from './testing'

describe('newHand', () => {
  const seeds = Array.from({ length: 100 }, (_, i) => i * 7919 + 1)

  it('conserves all 144 tiles', () => {
    for (const seed of seeds) expectConservation(newHand({ seed, dealer: 0, prevailingWind: 'E' }))
  })

  it('deals 14 to the dealer and 13 to everyone else', () => {
    for (const seed of seeds) {
      const dealer = (seed % 4) as Seat
      const s = newHand({ seed, dealer, prevailingWind: 'E' })
      for (let seat = 0; seat < 4; seat++) expect(effectiveSize(s, seat)).toBe(seat === dealer ? 14 : 13)
      expect(s.turn).toBe(dealer)
      expect(s.phase.kind).toBe('discard')
    }
  })

  it('replaces every flower from the back of the wall', () => {
    let flowersSeen = 0
    for (const seed of seeds) {
      const s = newHand({ seed, dealer: 0, prevailingWind: 'E' })
      expectNoFlowersInHands(s)
      const flowers = s.flowers.reduce((n, f) => n + f.length, 0)
      flowersSeen += flowers
      expect(s.wall.length).toBe(144 - 53 - flowers)
    }
    expect(flowersSeen).toBeGreaterThan(0)
  })

  it('is deterministic for a seed', () => {
    const a = newHand({ seed: 99, dealer: 2, prevailingWind: 'S' })
    const b = newHand({ seed: 99, dealer: 2, prevailingWind: 'S' })
    expect(a).toEqual(b)
  })

  it('gives the dealer East and rotates seat winds in turn order', () => {
    const s = newHand({ seed: 1, dealer: 2, prevailingWind: 'E' })
    expect([0, 1, 2, 3].map((seat) => seatWind(s, seat as Seat))).toEqual(['W', 'N', 'E', 'S'])
  })
})
