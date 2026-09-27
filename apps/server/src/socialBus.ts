import type { Presence } from '@colyseus/core'
import type { FriendTable, TableInvite } from '@mahjong/protocol'

/**
 * What the social and table rooms share through Colyseus Presence, so it keeps working if rooms
 * ever spread over several processes.
 */

/** Presence hash: user id → how many social connections they have open (tabs, devices). */
export const ONLINE_KEY = 'social:online'
/** Presence hash: user id → code of the table they are seated at. */
export const AT_KEY = 'social:at'
/** Presence hash: table code → JSON `FriendTable` without the code. */
export const TABLES_KEY = 'social:tables'

/** Presence channel for everything one user's social connections need to hear. */
export const topic = (userId: string) => `social:user:${userId}`

/** Published on a user's topic: refresh their friends list, or hand them a table invite. */
export type SocialEvent = { kind: 'refresh' } | { kind: 'invite'; invite: TableInvite }

/** Tell every connection of these users, in any room, to refresh their friends list. */
export async function publishRefresh(presence: Presence, ...userIds: string[]): Promise<void> {
  const event: SocialEvent = { kind: 'refresh' }
  for (const id of new Set(userIds)) if (id) await presence.publish(topic(id), event)
}

/** The table a user is seated at, if any, as their friends see it. */
export async function tableOf(presence: Presence, userId: string): Promise<FriendTable | null> {
  const code = await presence.hget(AT_KEY, userId)
  if (!code) return null
  const raw = await presence.hget(TABLES_KEY, code)
  if (!raw) return null
  try {
    const { openSeats, playing } = JSON.parse(raw) as { openSeats: number; playing: boolean }
    return { code, openSeats, playing }
  } catch {
    return null
  }
}
