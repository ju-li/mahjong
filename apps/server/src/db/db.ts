import { CompiledQuery, Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './schema'

export type Db = Kysely<Database>

/**
 * Schema holding every game table. The database is shared with Logto, which owns `public` and
 * refuses to start while `public` has tables without row-level security.
 */
export const SCHEMA = 'mahjong'

// Postgres `bigint` comes back as a string by default; avatar seeds fit comfortably in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value))

/**
 * A pooled connection to the app database. Every connection resolves unqualified names in
 * `mahjong` first, so the query builder, raw `sql` and the migrations' `create table` all land there.
 */
export function createDb(url: string, maxConnections = 10): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: url, max: maxConnections }),
      onCreateConnection: async (connection) => {
        await connection.executeQuery(CompiledQuery.raw(`set search_path to ${SCHEMA}, public`))
      },
    }),
  })
}

/** The app database from `DATABASE_URL`, or null when it is unset (accounts and friends are then off). */
export function dbFromEnv(env: NodeJS.ProcessEnv = process.env): Db | null {
  return env.DATABASE_URL ? createDb(env.DATABASE_URL) : null
}
