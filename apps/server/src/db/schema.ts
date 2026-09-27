import type { ColumnType, Generated } from 'kysely'

/** Kysely's view of the app database. Column names are snake_case, as in the migrations. */
export type Database = {
  profiles: ProfilesTable
  friendships: FriendshipsTable
}

export type ProfilesTable = {
  /** Logto user id (`sub` of the access token). */
  user_id: string
  display_name: string
  /** Avatar seed, 0 ≤ avatar < 2^32; null = none picked. */
  avatar: ColumnType<number | null, number | null | undefined, number | null>
  /** Code in the player's friend invite link. */
  friend_code: string
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
