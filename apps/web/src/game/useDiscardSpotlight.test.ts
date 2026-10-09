import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tile } from '@mahjong/engine'
import { SPOTLIGHT_HOLD_MS, useDiscardSpotlight } from './useDiscardSpotlight'

const tile = (id: number): Tile => ({ id, kind: { suit: 'dots', rank: 5 } })

describe('discard spotlight queue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const ids = (q: ReturnType<typeof useDiscardSpotlight>) => q.entries.value.map((e) => e.tile.id)

  it('shows a discard, then sends it back after the hold', () => {
    const q = useDiscardSpotlight()
    q.add(tile(1), 1)
    expect(ids(q)).toEqual([1])
    vi.advanceTimersByTime(SPOTLIGHT_HOLD_MS - 1)
    expect(ids(q)).toEqual([1])
    vi.advanceTimersByTime(1)
    expect(ids(q)).toEqual([])
    // Its pond copy stays hidden until it has flown back.
    expect(q.spotlit.value.has(1)).toBe(true)
    q.landed(1)
    expect(q.spotlit.value.has(1)).toBe(false)
  })

  it('queues discards that come in quickly; each leaves in turn', () => {
    const q = useDiscardSpotlight()
    q.add(tile(1), 1)
    vi.advanceTimersByTime(400)
    q.add(tile(2), 2)
    q.add(tile(2), 2) // the same discard seen again is not added twice
    expect(ids(q)).toEqual([1, 2])
    vi.advanceTimersByTime(SPOTLIGHT_HOLD_MS - 400)
    expect(ids(q)).toEqual([2])
    vi.advanceTimersByTime(400)
    expect(ids(q)).toEqual([])
  })

  it('keeps a claimable discard until the claim window closes', () => {
    const q = useDiscardSpotlight()
    q.add(tile(1), 3, true)
    vi.advanceTimersByTime(SPOTLIGHT_HOLD_MS * 5)
    expect(ids(q)).toEqual([1])
    q.hold(null)
    vi.advanceTimersByTime(0)
    expect(ids(q)).toEqual([])
  })

  it('holds a discard that becomes claimable after it arrived, and keeps its full hold when released early', () => {
    const q = useDiscardSpotlight()
    q.add(tile(1), 1)
    q.hold(1)
    vi.advanceTimersByTime(SPOTLIGHT_HOLD_MS * 2)
    expect(q.entries.value[0]?.held).toBe(true)
    q.add(tile(2), 2)
    q.hold(null)
    vi.advanceTimersByTime(0)
    expect(ids(q)).toEqual([2])
  })

  it('dismisses one tile or all of them on demand', () => {
    const q = useDiscardSpotlight()
    q.add(tile(1), 1)
    q.add(tile(2), 2, true)
    q.dismiss(1)
    expect(ids(q)).toEqual([2])
    q.dismissAll()
    expect(ids(q)).toEqual([])
    q.reset()
    expect(q.spotlit.value.size).toBe(0)
  })
})
