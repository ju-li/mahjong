import type { Friend } from '@mahjong/protocol'

/** The friends list in display order: requests to answer, then who's online, then everyone else, then your pending asks. */
export function groupFriends(friends: readonly Friend[]): { incoming: Friend[]; online: Friend[]; offline: Friend[]; outgoing: Friend[] } {
  const byName = (a: Friend, b: Friend) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.userId.localeCompare(b.userId)
  const pick = (test: (f: Friend) => boolean) => friends.filter(test).sort(byName)
  return {
    incoming: pick((f) => f.state === 'incoming'),
    online: pick((f) => f.state === 'friend' && f.online),
    offline: pick((f) => f.state === 'friend' && !f.online),
    outgoing: pick((f) => f.state === 'outgoing'),
  }
}

/** What the Friends button says: how many friends you have until you have any, then how many are online. */
export function friendsCount(friends: readonly Friend[]): { key: 'friends.count.none' | 'friends.count.online'; n: number } {
  const accepted = friends.filter((f) => f.state === 'friend')
  if (accepted.length === 0) return { key: 'friends.count.none', n: 0 }
  return { key: 'friends.count.online', n: accepted.filter((f) => f.online).length }
}

/** Friend invite code from a link's `?friend=` value, or null if it can't be one. */
export function parseFriendCode(raw: string | null): string | null {
  const code = raw?.trim().toLowerCase() ?? ''
  return /^[a-hjkmnp-z2-9]{10}$/.test(code) ? code : null
}
