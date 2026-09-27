import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { Db } from './db'
import { acceptInvite, ensureProfile, getProfile, isFriendCode, listFriends, MAX_OUTGOING, newFriendCode, remove, respond, sendRequest, updateProfile } from './friends'
import { migrateToLatest } from './migrations'
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
  await sql`truncate friendships, profiles`.execute(db)
})

const seed = (name: string) => ({ name, avatar: 7 })
const states = async (id: string) => Object.fromEntries((await listFriends(db, id)).map((f) => [f.userId, f.state]))

describe('migrations', () => {
  it('are idempotent', async () => {
    expect(await migrateToLatest(db)).toEqual([])
  })
})

describe('friend codes', () => {
  it('are ten unambiguous characters', () => {
    const code = newFriendCode()
    expect(code).toMatch(/^[a-z2-9]{10}$/)
    expect(isFriendCode(code)).toBe(true)
    expect(isFriendCode('short')).toBe(false)
    expect(isFriendCode("x' or 1=1")).toBe(false)
  })
})

describe('profiles', () => {
  it('are created once from the guest name, then keep the account name', async () => {
    const first = await ensureProfile(db, 'u1', seed('Ann'))
    expect(first).toMatchObject({ userId: 'u1', name: 'Ann', avatar: 7 })
    expect(isFriendCode(first.friendCode)).toBe(true)
    const again = await ensureProfile(db, 'u1', { name: 'Other device', avatar: 3 })
    expect(again).toEqual(first)
    await updateProfile(db, 'u1', { name: 'Annie', avatar: 4_000_000_000 })
    expect(await getProfile(db, 'u1')).toMatchObject({ name: 'Annie', avatar: 4_000_000_000 })
  })
})

describe('friend requests', () => {
  beforeEach(async () => {
    for (const [id, name] of [['a', 'Ann'], ['b', 'Bo'], ['c', 'Cy']]) await ensureProfile(db, id!, seed(name!))
  })

  it('go pending, then accepted', async () => {
    expect(await sendRequest(db, 'a', 'b')).toEqual({ ok: true })
    expect(await states('a')).toEqual({ b: 'outgoing' })
    expect(await states('b')).toEqual({ a: 'incoming' })
    expect(await respond(db, 'a', 'b', true)).toEqual({ ok: false, error: 'unknown' }) // can't accept your own
    expect(await respond(db, 'b', 'a', true)).toEqual({ ok: true })
    expect(await states('a')).toEqual({ b: 'friend' })
    expect(await states('b')).toEqual({ a: 'friend' })
    expect((await listFriends(db, 'a'))[0]).toEqual({ userId: 'b', name: 'Bo', avatar: 7, state: 'friend' })
  })

  it('crossing requests become a friendship', async () => {
    await sendRequest(db, 'a', 'b')
    await sendRequest(db, 'b', 'a')
    expect(await states('a')).toEqual({ b: 'friend' })
  })

  it('reject yourself and strangers', async () => {
    expect(await sendRequest(db, 'a', 'a')).toEqual({ ok: false, error: 'self' })
    expect(await sendRequest(db, 'a', 'nobody')).toEqual({ ok: false, error: 'unknown' })
  })

  it('can be declined, cancelled, and friends removed', async () => {
    await sendRequest(db, 'a', 'b')
    await respond(db, 'b', 'a', false)
    expect(await states('a')).toEqual({})
    await sendRequest(db, 'a', 'c')
    await remove(db, 'a', 'c')
    expect(await states('c')).toEqual({})
    await sendRequest(db, 'a', 'b')
    await respond(db, 'b', 'a', true)
    await remove(db, 'b', 'a')
    expect(await states('a')).toEqual({})
  })

  it('cap outgoing requests', async () => {
    for (let i = 0; i < MAX_OUTGOING; i++) {
      await ensureProfile(db, `x${i}`, seed(`X${i}`))
      expect(await sendRequest(db, 'a', `x${i}`)).toEqual({ ok: true })
    }
    expect(await sendRequest(db, 'a', 'b')).toEqual({ ok: false, error: 'limit' })
  })
})

describe('invite links', () => {
  it('make friends straight away, even over a pending request', async () => {
    const ann = await ensureProfile(db, 'a', seed('Ann'))
    await ensureProfile(db, 'b', seed('Bo'))
    expect(await acceptInvite(db, 'b', ann.friendCode)).toEqual({ ok: true, friend: { userId: 'a', name: 'Ann' } })
    expect(await states('a')).toEqual({ b: 'friend' })
    // Opening it again is harmless.
    expect(await acceptInvite(db, 'b', ann.friendCode)).toMatchObject({ ok: true })

    const cy = await ensureProfile(db, 'c', seed('Cy'))
    await sendRequest(db, 'b', 'c')
    expect(await acceptInvite(db, 'b', cy.friendCode)).toMatchObject({ ok: true })
    expect(await states('c')).toEqual({ b: 'friend' })
  })

  it('ignore your own code and unknown codes', async () => {
    const ann = await ensureProfile(db, 'a', seed('Ann'))
    expect(await acceptInvite(db, 'a', ann.friendCode)).toEqual({ ok: false, error: 'self' })
    expect(await acceptInvite(db, 'a', 'zzzzzzzzzz')).toEqual({ ok: false, error: 'unknown' })
    expect(await acceptInvite(db, 'a', 'nope')).toEqual({ ok: false, error: 'unknown' })
  })
})
