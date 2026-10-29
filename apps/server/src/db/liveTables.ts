import { sql } from 'kysely'
import type { Db } from './db'

/**
 * Open tables mirrored from server memory, so a restart or deploy can bring them back. Each row
 * belongs to one server process (`owner`, a boot id) that saves it as play goes on. Another
 * process may take a table over only once the owner has released it (it shut down cleanly) or
 * gone quiet for `staleMs` (it died).
 */

/** `now()` minus `ms` milliseconds, in SQL. */
const ago = (ms: number) => sql<Date>`now() - ${ms} * interval '1 millisecond'`

/**
 * Claim `code` for a new table. False if a table with that code is open on any process, or saved
 * and waiting to be restored; rows older than `expireMs` are free again.
 */
export async function reserveLiveTable(db: Db, code: string, owner: string, state: unknown, expireMs: number): Promise<boolean> {
  const row = await db
    .insertInto('live_tables')
    .values({ code, owner, state: JSON.stringify(state) })
    .onConflict((oc) =>
      oc
        .column('code')
        .doUpdateSet({ owner, state: JSON.stringify(state), released: false, saved_at: sql`now()` })
        .where('live_tables.saved_at', '<', ago(expireMs)),
    )
    .returning('code')
    .executeTakeFirst()
  return !!row
}

/** Save the table's latest state; `released` hands it on to the next process. False if `owner` no longer holds it. */
export async function saveLiveTable(db: Db, code: string, owner: string, state: unknown, released = false): Promise<boolean> {
  const result = await db
    .updateTable('live_tables')
    .set({ state: JSON.stringify(state), released, saved_at: sql`now()` })
    .where('code', '=', code)
    .where('owner', '=', owner)
    .executeTakeFirst()
  return result.numUpdatedRows > 0n
}

/** Nothing changed, but the owner is alive: keeps others from taking the table over. */
export async function touchLiveTable(db: Db, code: string, owner: string): Promise<boolean> {
  const result = await db.updateTable('live_tables').set({ saved_at: sql`now()` }).where('code', '=', code).where('owner', '=', owner).executeTakeFirst()
  return result.numUpdatedRows > 0n
}

/**
 * Take over a saved table: its state, or `'held'` while its owner is still alive (try again soon),
 * or null if there is nothing to restore (never saved, or older than `expireMs`). Only one of two
 * processes claiming the same table at once gets it.
 */
export async function claimLiveTable(db: Db, code: string, owner: string, staleMs: number, expireMs: number): Promise<{ state: unknown } | 'held' | null> {
  const claimed = await db
    .updateTable('live_tables')
    .set({ owner, released: false, saved_at: sql`now()` })
    .where('code', '=', code)
    .where((eb) => eb.or([eb('released', '=', true), eb('saved_at', '<', ago(staleMs))]))
    .where('saved_at', '>=', ago(expireMs))
    .returning('state')
    .executeTakeFirst()
  if (claimed) return { state: claimed.state }
  const held = await db.selectFrom('live_tables').select('code').where('code', '=', code).where('released', '=', false).where('saved_at', '>=', ago(staleMs)).executeTakeFirst()
  return held ? 'held' : null
}

/** The table closed for good. */
export async function deleteLiveTable(db: Db, code: string, owner: string): Promise<void> {
  await db.deleteFrom('live_tables').where('code', '=', code).where('owner', '=', owner).execute()
}

/** Forget tables nobody came back to. */
export async function purgeLiveTables(db: Db, expireMs: number): Promise<number> {
  const result = await db.deleteFrom('live_tables').where('saved_at', '<', ago(expireMs)).executeTakeFirst()
  return Number(result.numDeletedRows)
}
