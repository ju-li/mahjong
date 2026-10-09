import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { MAX_PREFERENCES_BYTES } from '@mahjong/protocol'
import type { Db } from './db'
import { ensureProfile } from './friends'
import { cleanPreferences, getPreferences, savePreferences } from './preferences'
import { startTestDb } from './testDb'

let db: Db
let stop: () => Promise<void>

beforeAll(async () => {
  ;({ db, stop } = await startTestDb())
})
afterAll(async () => {
  await stop()
})
beforeEach(async () => {
  await sql`truncate friendships, profiles cascade`.execute(db)
  await ensureProfile(db, 'a', { name: 'Ann', avatar: 1 })
})

describe('preferences', () => {
  it('are empty until saved', async () => {
    expect(await getPreferences(db, 'a')).toEqual({ settings: null, updatedAt: null })
  })

  it('round-trip, and an older copy never overwrites a newer one', async () => {
    const newer = { settings: { rules: 'hk', house: { hk: { kongFaan: 'each1' } } }, updatedAt: Date.now() - 1000 }
    expect(await savePreferences(db, 'a', newer)).toEqual(newer)
    expect(await savePreferences(db, 'a', { settings: { rules: 'mcr' }, updatedAt: Date.now() - 5000 })).toEqual(newer)
    const latest = { settings: { rules: 'mcr' }, updatedAt: Date.now() }
    expect(await savePreferences(db, 'a', latest)).toEqual(latest)
  })

  it('reject anything but a small plain object', () => {
    expect(cleanPreferences(null)).toBeNull()
    expect(cleanPreferences({ settings: [1, 2] })).toBeNull()
    expect(cleanPreferences({ settings: 'x' })).toBeNull()
    expect(cleanPreferences({ settings: { big: 'x'.repeat(MAX_PREFERENCES_BYTES) } })).toBeNull()
    // A time from the future becomes now.
    const now = 1_800_000_000_000
    expect(cleanPreferences({ settings: {}, updatedAt: now + 3_600_000 }, now)).toEqual({ settings: {}, updatedAt: now })
  })
})
