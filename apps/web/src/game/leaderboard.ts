import type { RuleSet } from '@mahjong/engine'
import { LEADERBOARD_PATH, type LeaderboardEntry } from '@mahjong/protocol'
import { SERVER_HTTP_URL } from './serverUrl'

/** The public leaderboard for a rule set, or null if the server can't be reached. */
export async function fetchLeaderboard(rules: RuleSet): Promise<LeaderboardEntry[] | null> {
  try {
    const res = await fetch(`${SERVER_HTTP_URL}${LEADERBOARD_PATH}?rules=${rules}`)
    if (!res.ok) return null
    const body = (await res.json()) as { entries?: LeaderboardEntry[] }
    return Array.isArray(body.entries) ? body.entries : null
  } catch {
    return null
  }
}
