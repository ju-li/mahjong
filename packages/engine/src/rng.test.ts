import { describe, expect, it } from 'vitest'
import { createWall, mulberry32, shuffle } from './index'

describe('mulberry32', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 1000; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  const wall = createWall()
  const ids = (tiles: { id: number }[]) => tiles.map((t) => t.id)

  it('gives the same order for the same seed', () => {
    expect(ids(shuffle(wall, 12345))).toEqual(ids(shuffle(wall, 12345)))
  })

  it('gives different orders for different seeds', () => {
    expect(ids(shuffle(wall, 1))).not.toEqual(ids(shuffle(wall, 2)))
    expect(ids(shuffle(wall, 12345))).not.toEqual(ids(shuffle(wall, 54321)))
  })

  it('does not mutate the input and returns a permutation', () => {
    const before = ids(wall)
    const shuffled = shuffle(wall, 7)
    expect(ids(wall)).toEqual(before)
    expect(shuffled).not.toBe(wall)
    expect([...ids(shuffled)].sort((a, b) => a - b)).toEqual(before)
    expect(ids(shuffled)).not.toEqual(before)
  })
})
