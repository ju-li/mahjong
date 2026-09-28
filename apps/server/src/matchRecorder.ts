import type { RatingChange } from '@mahjong/protocol'
import type { Db } from './db/db'
import { recordOnlineMatch, type OnlineMatchRecord } from './db/matches'

/** Waits between attempts to save a finished match; the database may be restarting. */
export const RETRY_DELAYS_MS = [1_000, 5_000, 30_000]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Save a finished online match, retrying a few times if the database is unavailable. Saving is
 * idempotent, so a retry after a write that actually succeeded is harmless. Resolves with each
 * rated account's rating change, or null if accounts are off or every attempt failed.
 */
export async function saveMatch(
  db: Db | null,
  record: OnlineMatchRecord,
  opts: { delays?: number[]; wait?: (ms: number) => Promise<void>; save?: typeof recordOnlineMatch } = {},
): Promise<Map<string, RatingChange> | null> {
  if (!db) return null
  const { delays = RETRY_DELAYS_MS, wait = sleep, save = recordOnlineMatch } = opts
  for (let attempt = 0; ; attempt++) {
    try {
      return await save(db, record)
    } catch (error) {
      if (attempt >= delays.length) {
        console.error(`match ${record.id}: could not be saved`, error)
        return null
      }
      console.warn(`match ${record.id}: save failed, retrying`, error)
      await wait(delays[attempt]!)
    }
  }
}
