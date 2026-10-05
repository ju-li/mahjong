import { beforeEach, describe, expect, it } from 'vitest'
import type { SoloResult } from '@mahjong/protocol'
import { dequeueResult, enqueueResult, MAX_PENDING, percent, readQueue, signed, withResult } from './stats'

const result = (seed: number) => ({ seed }) as SoloResult

/** Tests run in Node: a minimal in-memory localStorage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

describe('pending solo results', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage()
  })

  it('keeps each match once, newest last, capped', () => {
    let q: SoloResult[] = []
    for (let i = 0; i < MAX_PENDING + 5; i++) q = withResult(q, result(i))
    expect(q).toHaveLength(MAX_PENDING)
    expect(q[0]!.seed).toBe(5)
    q = withResult(q, result(10))
    expect(q.filter((r) => r.seed === 10)).toHaveLength(1)
    expect(q.at(-1)!.seed).toBe(10)
  })

  it('survives in storage until the server has it', () => {
    enqueueResult(result(1))
    enqueueResult(result(2))
    expect(readQueue().map((r) => r.seed)).toEqual([1, 2])
    dequeueResult(1)
    expect(readQueue().map((r) => r.seed)).toEqual([2])
    dequeueResult(2)
    expect(localStorage.getItem('mahjong.pendingResults')).toBeNull()
  })
})

describe('formatting', () => {
  it('signs rating changes and rounds percentages', () => {
    expect([signed(22), signed(-8), signed(0)]).toEqual(['+22', '−8', '±0'])
    expect([percent(1, 3), percent(0, 0)]).toEqual(['33%', '–'])
  })
})
