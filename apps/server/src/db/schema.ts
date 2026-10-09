import type { ColumnType, Generated } from 'kysely'

/** Kysely's view of the app database. Column names are snake_case, as in the migrations. */
export type Database = {
  profiles: ProfilesTable
  friendships: FriendshipsTable
  matches: MatchesTable
  match_players: MatchPlayersTable
  match_hands: MatchHandsTable
  ratings: RatingsTable
  rating_history: RatingHistoryTable
}

export type ProfilesTable = {
  /** Logto user id (`sub` of the access token). */
  user_id: string
  display_name: string
  /** Avatar seed, 0 ≤ avatar < 2^32; null = none picked. */
  avatar: ColumnType<number | null, number | null | undefined, number | null>
  /** Code in the player's friend invite link. */
  friend_code: string
  /** The player's synced app settings (`PreferencesSync.settings`); null = never saved. */
  preferences: ColumnType<unknown, string | null | undefined, string | null>
  preferences_updated_at: ColumnType<Date | null, Date | null | undefined, Date | null>
  created_at: ColumnType<Date, never, never>
  updated_at: ColumnType<Date, never, Date>
}

export type FriendshipsTable = {
  /** The pair, smaller id first, so each friendship has exactly one row. */
  user_low: string
  user_high: string
  requested_by: string
  status: 'pending' | 'accepted'
  created_at: Generated<Date>
  accepted_at: Date | null
}

export type MatchesTable = {
  id: string
  kind: 'online' | 'solo'
  rule_set: 'mcr' | 'hk'
  /** Bot difficulty of a solo match. */
  difficulty: string | null
  /** Changed ratings (online matches with ≥ 2 full-match signed-in players). */
  rated: boolean
  /** Solo uploads: `userId:seed`, so the same match is never saved twice. */
  client_key: string | null
  /** House rules the match started with, as JSON ('{}' = standard). */
  house_rules: ColumnType<unknown, string | undefined, string>
  started_at: Date
  ended_at: Date
}

export type MatchPlayersTable = {
  match_id: string
  /** Engine player 0..3. */
  player: number
  /** Signed-in player's account; null = guest or bot. */
  user_id: string | null
  name: string
  avatar: number | null
  bot: boolean
  final_score: number
  placement: number
  /** Sat in this seat, signed in, from the first hand to the last. */
  full_match: boolean
}

export type MatchHandsTable = {
  match_id: string
  hand_index: number
  dealer: number
  prevailing_wind: string
  seed: number
  /** `StoredResult` as JSON. */
  result: ColumnType<unknown, string, string>
  player_deltas: number[]
  /** Every action of the hand, for replays (online matches only). */
  actions: ColumnType<unknown, string | null, string | null>
  /** House rules the hand was played with, as JSON; null = standard. */
  house_rules: ColumnType<unknown, string | null | undefined, string | null>
}

export type RatingsTable = {
  user_id: string
  rule_set: 'mcr' | 'hk'
  mu: number
  sigma: number
  matches: number
  firsts: number
  updated_at: ColumnType<Date, Date | undefined, Date>
}

export type RatingHistoryTable = {
  match_id: string
  user_id: string
  rule_set: 'mcr' | 'hk'
  mu_before: number
  sigma_before: number
  mu_after: number
  sigma_after: number
}
