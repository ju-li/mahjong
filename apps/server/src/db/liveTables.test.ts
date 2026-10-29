import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { Db } from './db'
import { claimLiveTable, deleteLiveTable, purgeLiveTables, reserveLiveTable, saveLiveTable, touchLiveTable } from './liveTables'
import { startTestDb } from './testDb'

let db: Db
let stop: () => Promise<void>

beforeAll(async () => {
  const testDb = await startTestDb()
  db = testDb.db
  stop = testDb.stop
})
afterAll(() => stop())
beforeEach(async () => {
  await db.deleteFrom('live_tables').execute()
})

const STALE = 15_000
const EXPIRE = 30 * 60_000
/** Pretend the row was last saved this long ago. */
const age = (code: string, ms: number) => sql`update live_tables set saved_at = now() - ${ms} * interval '1 millisecond' where code = ${code}`.execute(db)

describe('live tables', () => {
  it('gives a code to one process at a time, and frees it once expired', async () => {
    expect(await reserveLiveTable(db, 'ABCD', 'old', { n: 1 }, EXPIRE)).toBe(true)
    expect(await reserveLiveTable(db, 'ABCD', 'new', { n: 2 }, EXPIRE)).toBe(false)
    // Released for a restart: still not free, someone may come back to it.
    await saveLiveTable(db, 'ABCD', 'old', { n: 1 }, true)
    expect(await reserveLiveTable(db, 'ABCD', 'new', { n: 2 }, EXPIRE)).toBe(false)
    await age('ABCD', EXPIRE + 1000)
    expect(await reserveLiveTable(db, 'ABCD', 'new', { n: 2 }, EXPIRE)).toBe(true)
    expect(await claimLiveTable(db, 'ABCD', 'third', STALE, EXPIRE)).toBe('held')
  })

  it('lets another process restore a table only once its owner released it or went quiet', async () => {
    await reserveLiveTable(db, 'ABCD', 'old', { n: 1 }, EXPIRE)
    expect(await saveLiveTable(db, 'ABCD', 'old', { n: 2 })).toBe(true)
    expect(await claimLiveTable(db, 'ABCD', 'new', STALE, EXPIRE)).toBe('held')
    expect(await claimLiveTable(db, 'NONE', 'new', STALE, EXPIRE)).toBeNull()

    // Released on shutdown: taken over at once, with the last state saved.
    await saveLiveTable(db, 'ABCD', 'old', { n: 3 }, true)
    expect(await claimLiveTable(db, 'ABCD', 'new', STALE, EXPIRE)).toEqual({ state: { n: 3 } })
    // Now it is the new owner's; the old one can't write over it.
    expect(await saveLiveTable(db, 'ABCD', 'old', { n: 4 })).toBe(false)
    expect(await touchLiveTable(db, 'ABCD', 'old')).toBe(false)
    expect(await claimLiveTable(db, 'ABCD', 'third', STALE, EXPIRE)).toBe('held')

    // The owner died without a word: once its heartbeat is stale, another process may take over.
    await age('ABCD', STALE + 1000)
    expect(await claimLiveTable(db, 'ABCD', 'third', STALE, EXPIRE)).toEqual({ state: { n: 3 } })
  })

  it('gives a table to only one of two processes restoring it at once (V68)', async () => {
    await reserveLiveTable(db, 'ABCD', 'old', { n: 1 }, EXPIRE)
    await saveLiveTable(db, 'ABCD', 'old', { n: 1 }, true)
    const claims = await Promise.all([claimLiveTable(db, 'ABCD', 'a', STALE, EXPIRE), claimLiveTable(db, 'ABCD', 'b', STALE, EXPIRE)])
    expect(claims.filter((c) => c !== 'held')).toEqual([{ state: { n: 1 } }])
  })

  it('does not restore a table nobody came back to in time, and purges it', async () => {
    await reserveLiveTable(db, 'ABCD', 'old', { n: 1 }, EXPIRE)
    await saveLiveTable(db, 'ABCD', 'old', { n: 1 }, true)
    await reserveLiveTable(db, 'WXYZ', 'old', { n: 1 }, EXPIRE)
    await age('ABCD', EXPIRE + 1000)
    expect(await claimLiveTable(db, 'ABCD', 'new', STALE, EXPIRE)).toBeNull()
    expect(await purgeLiveTables(db, EXPIRE)).toBe(1)
    await deleteLiveTable(db, 'WXYZ', 'someone-else')
    expect(await db.selectFrom('live_tables').select('code').execute()).toEqual([{ code: 'WXYZ' }])
    await deleteLiveTable(db, 'WXYZ', 'old')
    expect(await db.selectFrom('live_tables').select('code').execute()).toEqual([])
  })
})
