import { MAX_PREFERENCES_BYTES, type PreferencesSync } from '@mahjong/protocol'
import type { Db } from './db'

/**
 * A player's synced app settings. The server keeps them as the web app sent them (only that
 * player ever reads them back); it only checks they are a small plain object with a sane time.
 */
export function cleanPreferences(raw: unknown, now = Date.now()): { settings: Record<string, unknown>; updatedAt: number } | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { settings, updatedAt } = raw as Partial<PreferencesSync>
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) return null
  if (JSON.stringify(settings).length > MAX_PREFERENCES_BYTES) return null
  const at = typeof updatedAt === 'number' && Number.isInteger(updatedAt) && updatedAt > 0 && updatedAt <= now + 60_000 ? updatedAt : now
  return { settings, updatedAt: at }
}

export async function getPreferences(db: Db, userId: string): Promise<PreferencesSync> {
  const row = await db.selectFrom('profiles').select(['preferences', 'preferences_updated_at']).where('user_id', '=', userId).executeTakeFirst()
  return {
    settings: (row?.preferences as Record<string, unknown> | null | undefined) ?? null,
    updatedAt: row?.preferences_updated_at?.getTime() ?? null,
  }
}

/** Store newer preferences; an older copy (from a device that was offline) never overwrites a newer one. Returns what is stored. */
export async function savePreferences(db: Db, userId: string, raw: unknown): Promise<PreferencesSync | null> {
  const prefs = cleanPreferences(raw)
  if (!prefs) return null
  await db
    .updateTable('profiles')
    .set({ preferences: JSON.stringify(prefs.settings), preferences_updated_at: new Date(prefs.updatedAt) })
    .where('user_id', '=', userId)
    .where((eb) => eb.or([eb('preferences_updated_at', 'is', null), eb('preferences_updated_at', '<=', new Date(prefs.updatedAt))]))
    .execute()
  return getPreferences(db, userId)
}
