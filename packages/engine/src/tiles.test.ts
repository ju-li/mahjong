import { describe, expect, it } from 'vitest'
import { createWall, FLOWER_KINDS, isFlower, PLAYABLE_KINDS, tileKey } from './index'

describe('createWall', () => {
  const wall = createWall()

  it('has 144 tiles', () => {
    expect(wall).toHaveLength(144)
  })

  it('has 136 non-flower tiles', () => {
    expect(wall.filter((t) => !isFlower(t.kind))).toHaveLength(136)
  })

  it('has 34 playable kinds with exactly 4 copies each', () => {
    expect(PLAYABLE_KINDS).toHaveLength(34)
    const counts = new Map<string, number>()
    for (const t of wall) counts.set(tileKey(t.kind), (counts.get(tileKey(t.kind)) ?? 0) + 1)
    for (const kind of PLAYABLE_KINDS) {
      expect(counts.get(tileKey(kind)), tileKey(kind)).toBe(4)
    }
  })

  it('has 8 unique flowers', () => {
    const flowers = wall.filter((t) => isFlower(t.kind))
    expect(flowers).toHaveLength(8)
    expect(new Set(flowers.map((t) => tileKey(t.kind))).size).toBe(8)
    expect(FLOWER_KINDS).toHaveLength(8)
  })

  it('gives every tile a unique id', () => {
    expect(new Set(wall.map((t) => t.id)).size).toBe(144)
  })

  it('has 42 distinct tile keys in total', () => {
    expect(new Set(wall.map((t) => tileKey(t.kind))).size).toBe(42)
  })
})
