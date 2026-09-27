import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { createDb, type Db } from './db'
import { migrateToLatest } from './migrations'

/**
 * A throwaway, migrated Postgres for tests: PGlite (Postgres compiled to WASM) behind a real
 * wire-protocol socket, so `pg` and Kysely talk to it exactly as they would to Railway's.
 */
export async function startTestDb(): Promise<{ db: Db; url: string; stop(): Promise<void> }> {
  const pglite = await PGlite.create()
  const port = 40_000 + Math.floor(Math.random() * 20_000)
  const server = new PGLiteSocketServer({ db: pglite, port, maxConnections: 20 })
  await server.start()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  const db = createDb(url)
  await migrateToLatest(db)
  return {
    db,
    url,
    async stop() {
      await db.destroy()
      await server.stop()
      await pglite.close()
    },
  }
}
