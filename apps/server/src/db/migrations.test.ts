import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Migrator } from 'kysely/migration'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import pg from 'pg'
import { createDb } from './db'
import { getProfile, listFriends } from './friends'
import { LEGACY_PUBLIC_TABLES, migrateToLatest, migrations } from './migrations'

let pglite: PGlite
let server: PGLiteSocketServer
let url: string

beforeEach(async () => {
  pglite = await PGlite.create()
  const port = 40_000 + Math.floor(Math.random() * 20_000)
  server = new PGLiteSocketServer({ db: pglite, port, maxConnections: 20 })
  await server.start()
  url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
})
afterEach(async () => {
  await server.stop()
  await pglite.close()
})

/** A connection with Postgres' default search path, as the server had before `mahjong` existed. */
function plainDb(): Kysely<any> {
  return new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }) })
}

/** Which schema each table and index is in, ignoring Postgres' own. */
async function relations(db: Kysely<any>, kinds: string[]): Promise<Record<string, string[]>> {
  const { rows } = await sql<{ schema: string; name: string }>`
    select n.nspname as schema, c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in (${sql.join(kinds)}) and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
    order by c.relname`.execute(db)
  const bySchema: Record<string, string[]> = {}
  for (const r of rows) (bySchema[r.schema] ??= []).push(r.name)
  return bySchema
}
const tables = (db: Kysely<any>) => relations(db, ['r', 'p'])

describe('migrateToLatest', () => {
  it('creates every table in mahjong on an empty database', async () => {
    const db = createDb(url, 1)
    try {
      expect(await migrateToLatest(db)).toEqual({ moved: [], applied: Object.keys(migrations) })
      expect(await tables(db)).toEqual({ mahjong: [...LEGACY_PUBLIC_TABLES].sort() })
      expect(await migrateToLatest(db)).toEqual({ moved: [], applied: [] })
    } finally {
      await db.destroy()
    }
  })

  it('moves the tables an earlier deploy left in public, with their data, and leaves the rest of public alone', async () => {
    // The state before this change: migrations run with the default search path, next to Logto's tables.
    const old = plainDb()
    const { error } = await new Migrator({ db: old, provider: { getMigrations: async () => migrations } }).migrateToLatest()
    expect(error).toBeUndefined()
    await sql`create table users (id text primary key)`.execute(old)
    await sql`alter table users enable row level security`.execute(old)
    await sql`insert into users values ('logto-user')`.execute(old)
    await sql`insert into profiles (user_id, display_name, friend_code) values ('a', 'Ann', 'code-a'), ('b', 'Bo', 'code-b')`.execute(old)
    await sql`insert into friendships (user_low, user_high, requested_by, status) values ('a', 'b', 'a', 'accepted')`.execute(old)
    const applied = (await sql<{ name: string; timestamp: string }>`select name, timestamp from kysely_migration order by name`.execute(old)).rows
    const indexesBefore = (await relations(old, ['i'])).public!.filter((i) => i !== 'users_pkey')
    await old.destroy()

    const db = createDb(url, 1)
    try {
      expect(await migrateToLatest(db)).toEqual({ moved: [...LEGACY_PUBLIC_TABLES], applied: [] })
      expect(await tables(db)).toEqual({ mahjong: [...LEGACY_PUBLIC_TABLES].sort(), public: ['users'] })
      expect(await relations(db, ['i'])).toEqual({ mahjong: indexesBefore, public: ['users_pkey'] })
      expect((await sql`select name, timestamp from mahjong.kysely_migration order by name`.execute(db)).rows).toEqual(applied)
      expect((await sql<{ rls: boolean }>`select relrowsecurity as rls from pg_class where oid = 'public.users'::regclass`.execute(db)).rows).toEqual([{ rls: true }])
      expect((await sql`select id from public.users`.execute(db)).rows).toEqual([{ id: 'logto-user' }])
      expect((await getProfile(db, 'a'))?.name).toBe('Ann')
      expect((await listFriends(db, 'a')).map((f) => [f.userId, f.state])).toEqual([['b', 'friend']])
      // Again: nothing left to move or apply.
      expect(await migrateToLatest(db)).toEqual({ moved: [], applied: [] })
    } finally {
      await db.destroy()
    }
  })

  it('refuses to guess when a table is in both schemas', async () => {
    const old = plainDb()
    await sql`create table profiles (user_id text primary key)`.execute(old)
    await sql`create schema mahjong`.execute(old)
    await sql`create table mahjong.profiles (user_id text primary key)`.execute(old)
    await sql`create table matches (id uuid primary key)`.execute(old)
    await old.destroy()

    const db = createDb(url, 1)
    try {
      await expect(migrateToLatest(db)).rejects.toThrow('in both public and mahjong, resolve by hand: profiles')
      // Rolled back: nothing moved.
      expect(await tables(db)).toEqual({ mahjong: ['profiles'], public: ['matches', 'profiles'] })
    } finally {
      await db.destroy()
    }
  })
})
