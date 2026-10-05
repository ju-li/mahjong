import { describe, expect, it } from 'vitest'
import { displayRating, initialSkill, rateMatch } from './rating'

describe('rating', () => {
  it('starts everyone at 1000', () => {
    expect(displayRating(initialSkill())).toBe(1000)
  })

  it('moves winners up and losers down, and grows surer', () => {
    const start = initialSkill()
    const [first, second, third] = rateMatch([start, start, start], [1, 2, 3])
    expect(first!.mu).toBeGreaterThan(start.mu)
    expect(third!.mu).toBeLessThan(start.mu)
    expect(second!.mu).toBeGreaterThan(third!.mu)
    for (const s of [first!, second!, third!]) expect(s.sigma).toBeLessThan(start.sigma)
    expect(displayRating(first!)).toBeGreaterThan(displayRating(third!))
  })

  it('treats a tie as a tie', () => {
    const start = initialSkill()
    const [a, b] = rateMatch([start, start], [1, 1])
    expect(a!.mu).toBeCloseTo(b!.mu)
  })
})
