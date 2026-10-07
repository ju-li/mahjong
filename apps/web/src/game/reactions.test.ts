import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REACTION_BURST, REACTION_WINDOW_MS } from '@mahjong/protocol'
import { FLOAT_MS, MAX_FLOATING, reactionThrottle, useReactionFeed } from './reactions'

describe('reaction feed', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('floats each reaction for a while, then lets it go', () => {
    const { floating, push } = useReactionFeed(() => 0.5)
    push(1, 'fire')
    vi.advanceTimersByTime(FLOAT_MS / 2)
    push(2, 'heart')
    expect(floating.value.map((r) => [r.player, r.reaction, r.drift])).toEqual([
      [1, 'fire', 0],
      [2, 'heart', 0],
    ])
    vi.advanceTimersByTime(FLOAT_MS / 2)
    expect(floating.value.map((r) => r.reaction)).toEqual(['heart'])
    vi.advanceTimersByTime(FLOAT_MS / 2)
    expect(floating.value).toEqual([])
  })

  it('drops the oldest under a flood, and clears on demand', () => {
    const { floating, push, clear } = useReactionFeed()
    for (let i = 0; i < MAX_FLOATING + 5; i++) push(0, 'clap')
    expect(floating.value).toHaveLength(MAX_FLOATING)
    expect(floating.value[0]!.id).toBe(6)
    clear()
    expect(floating.value).toEqual([])
    vi.advanceTimersByTime(FLOAT_MS)
    expect(floating.value).toEqual([])
  })
})

describe('reaction throttle', () => {
  it('allows a burst, then waits out the window like the server does', () => {
    let now = 0
    const allow = reactionThrottle(() => now)
    for (let i = 0; i < REACTION_BURST; i++) expect(allow()).toBe(true)
    expect(allow()).toBe(false)
    now += REACTION_WINDOW_MS
    expect(allow()).toBe(true)
  })
})
