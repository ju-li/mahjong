import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './schema'

export type Db = Kysely<Database>

// Postgres `bigint` comes back as a string by default; avatar seeds fit comfortably in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value))

/** A pooled connection to the app database. */
export function createDb(url: string, maxConnections = 10): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: maxConnections }) }) })
}

/** The app database from `DATABASE_URL`, or null when it is unset (accounts and friends are then off). */
export function dbFromEnv(env: NodeJS.ProcessEnv = process.env): Db | null {
  return env.DATABASE_URL ? createDb(env.DATABASE_URL) : null
}
