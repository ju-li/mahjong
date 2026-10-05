import { describe, expect, it } from 'vitest'
import type { Db } from './db/db'
import type { OnlineMatchRecord } from './db/matches'
import { saveMatch } from './matchRecorder'

const record = { id: 'm1' } as OnlineMatchRecord
const db = {} as Db

describe('saveMatch', () => {
  it('retries until the save goes through', async () => {
    let calls = 0
    const waits: number[] = []
    const result = await saveMatch(db, record, {
      delays: [1, 2, 3],
      wait: async (ms) => void waits.push(ms),
      save: async () => {
        if (++calls < 3) throw new Error('db down')
        return new Map([['u', { rules: 'mcr', before: 1000, after: 1010 }]])
      },
    })
    expect(calls).toBe(3)
    expect(waits).toEqual([1, 2])
    expect(result!.get('u')!.after).toBe(1010)
  })

  it('gives up after the last retry, and does nothing without a database', async () => {
    let calls = 0
    const failing = async () => {
      calls++
      throw new Error('db down')
    }
    expect(await saveMatch(db, record, { delays: [1, 1], wait: async () => {}, save: failing })).toBeNull()
    expect(calls).toBe(3)
    expect(await saveMatch(null, record, { save: failing })).toBeNull()
    expect(calls).toBe(3)
  })
})
