import { randomInt } from 'node:crypto'
import { sql } from 'kysely'
import type { Db } from './db'

/** Most friends one player may have. */
export const MAX_FRIENDS = 200
/** Most unanswered requests one player may have out at once. */
export const MAX_OUTGOING = 50

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const CODE_LENGTH = 10

/** A fresh, unguessable friend-invite code. */
export function newFriendCode(random: (n: number) => number = randomInt): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join('')
}

/** Whether a string could be a friend code; anything else is rejected before touching the database. */
export function isFriendCode(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length === CODE_LENGTH && [...raw].every((c) => CODE_ALPHABET.includes(c))
}

export type Profile = { userId: string; name: string; avatar: number | null; friendCode: string }

export type FriendState = 'incoming' | 'outgoing' | 'friend'
export type FriendRow = { userId: string; name: string; avatar: number | null; state: FriendState }

export type FriendResult = { ok: true } | { ok: false; error: 'self' | 'unknown' | 'limit' }

/** The pair as stored: smaller id first. */
function pair(a: string, b: string): { user_low: string; user_high: string } {
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a }
}

const toProfile = (r: { user_id: string; display_name: string; avatar: number | null; friend_code: string }): Profile => ({
  userId: r.user_id,
  name: r.display_name,
  avatar: r.avatar,
  friendCode: r.friend_code,
})

/**
 * The player's profile, created on first sign-in from what they already chose as a guest.
 * An existing profile is returned untouched: the account's name wins over this device's.
 */
export async function ensureProfile(db: Db, userId: string, seed: { name: string; avatar: number | null }): Promise<Profile> {
  const existing = await getProfile(db, userId)
  if (existing) return existing
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db
      .insertInto('profiles')
      .values({ user_id: userId, display_name: seed.name, avatar: seed.avatar, friend_code: newFriendCode() })
      .onConflict((oc) => oc.doNothing())
      .returning(['user_id', 'display_name', 'avatar', 'friend_code'])
      .executeTakeFirst()
    if (row) return toProfile(row)
    // Either another connection created it first, or the friend code collided: look again.
    const raced = await getProfile(db, userId)
    if (raced) return raced
  }
  throw new Error('could not create profile')
}

export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const row = await db.selectFrom('profiles').select(['user_id', 'display_name', 'avatar', 'friend_code']).where('user_id', '=', userId).executeTakeFirst()
  return row ? toProfile(row) : null
}

/** Change a player's name and/or avatar. Values must already be cleaned. */
export async function updateProfile(db: Db, userId: string, update: { name?: string; avatar?: number | null }): Promise<void> {
  const set: { display_name?: string; avatar?: number | null; updated_at: Date } = { updated_at: new Date() }
  if (update.name !== undefined) set.display_name = update.name
  if (update.avatar !== undefined) set.avatar = update.avatar
  await db.updateTable('profiles').set(set).where('user_id', '=', userId).execute()
}

/** Everyone the player is linked to: friends and requests either way. */
export async function listFriends(db: Db, userId: string): Promise<FriendRow[]> {
  const rows = await db
    .selectFrom('friendships as f')
    .innerJoin('profiles as p', (join) => join.on(sql<boolean>`p.user_id = case when f.user_low = ${userId} then f.user_high else f.user_low end`))
    .select(['p.user_id', 'p.display_name', 'p.avatar', 'f.status', 'f.requested_by'])
    .where((eb) => eb.or([eb('f.user_low', '=', userId), eb('f.user_high', '=', userId)]))
    .execute()
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    avatar: r.avatar,
    state: r.status === 'accepted' ? 'friend' : r.requested_by === userId ? 'outgoing' : 'incoming',
  }))
}

/** Ids of the player's accepted friends. */
export async function friendIds(db: Db, userId: string): Promise<string[]> {
  return (await listFriends(db, userId)).filter((f) => f.state === 'friend').map((f) => f.userId)
}

/** Whether the two players are accepted friends. */
export async function areFriends(db: Db, a: string, b: string): Promise<boolean> {
  if (a === b) return false
  const key = pair(a, b)
  const row = await db.selectFrom('friendships').select('status').where('user_low', '=', key.user_low).where('user_high', '=', key.user_high).executeTakeFirst()
  return row?.status === 'accepted'
}

async function friendCount(db: Db, userId: string): Promise<number> {
  const row = await db
    .selectFrom('friendships')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('status', '=', 'accepted')
    .where((eb) => eb.or([eb('user_low', '=', userId), eb('user_high', '=', userId)]))
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

async function outgoingCount(db: Db, userId: string): Promise<number> {
  const row = await db
    .selectFrom('friendships')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('status', '=', 'pending')
    .where('requested_by', '=', userId)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

async function befriend(db: Db, a: string, b: string): Promise<FriendResult> {
  if ((await friendCount(db, a)) >= MAX_FRIENDS || (await friendCount(db, b)) >= MAX_FRIENDS) return { ok: false, error: 'limit' }
  await db
    .updateTable('friendships')
    .set({ status: 'accepted', accepted_at: new Date() })
    .where('user_low', '=', pair(a, b).user_low)
    .where('user_high', '=', pair(a, b).user_high)
    .execute()
  return { ok: true }
}

/**
 * Ask to be friends. If they already asked you, this accepts. Asking again, or asking a friend,
 * changes nothing.
 */
export async function sendRequest(db: Db, from: string, to: string): Promise<FriendResult> {
  if (from === to) return { ok: false, error: 'self' }
  if (!(await getProfile(db, to))) return { ok: false, error: 'unknown' }
  const key = pair(from, to)
  const row = await db.selectFrom('friendships').selectAll().where('user_low', '=', key.user_low).where('user_high', '=', key.user_high).executeTakeFirst()
  if (row?.status === 'accepted') return { ok: true }
  if (row) return row.requested_by === from ? { ok: true } : befriend(db, from, to)
  if ((await outgoingCount(db, from)) >= MAX_OUTGOING) return { ok: false, error: 'limit' }
  await db
    .insertInto('friendships')
    .values({ ...key, requested_by: from, status: 'pending', accepted_at: null })
    .onConflict((oc) => oc.doNothing())
    .execute()
  return { ok: true }
}

/** Answer a request someone sent you. Declining removes it; they are not told. */
export async function respond(db: Db, userId: string, other: string, accept: boolean): Promise<FriendResult> {
  const key = pair(userId, other)
  const row = await db.selectFrom('friendships').selectAll().where('user_low', '=', key.user_low).where('user_high', '=', key.user_high).executeTakeFirst()
  if (!row || row.status !== 'pending' || row.requested_by === userId) return { ok: false, error: 'unknown' }
  if (accept) return befriend(db, userId, other)
  await remove(db, userId, other)
  return { ok: true }
}

/** Unfriend, cancel your request or drop theirs: whatever links the two of you goes. */
export async function remove(db: Db, userId: string, other: string): Promise<void> {
  const key = pair(userId, other)
  await db.deleteFrom('friendships').where('user_low', '=', key.user_low).where('user_high', '=', key.user_high).execute()
}

export type InviteResult = { ok: true; friend: { userId: string; name: string } } | { ok: false; error: 'self' | 'unknown' | 'limit' }

/**
 * Open someone's invite link: sharing it was their yes, opening it is yours, so the two of you are
 * friends straight away.
 */
export async function acceptInvite(db: Db, userId: string, code: string): Promise<InviteResult> {
  if (!isFriendCode(code)) return { ok: false, error: 'unknown' }
  const owner = await db.selectFrom('profiles').select(['user_id', 'display_name']).where('friend_code', '=', code).executeTakeFirst()
  if (!owner) return { ok: false, error: 'unknown' }
  if (owner.user_id === userId) return { ok: false, error: 'self' }
  const key = pair(userId, owner.user_id)
  await db
    .insertInto('friendships')
    .values({ ...key, requested_by: owner.user_id, status: 'pending', accepted_at: null })
    .onConflict((oc) => oc.doNothing())
    .execute()
  const row = await db.selectFrom('friendships').select('status').where('user_low', '=', key.user_low).where('user_high', '=', key.user_high).executeTakeFirstOrThrow()
  if (row.status !== 'accepted') {
    const result = await befriend(db, userId, owner.user_id)
    if (!result.ok) return result
  }
  return { ok: true, friend: { userId: owner.user_id, name: owner.display_name } }
}
