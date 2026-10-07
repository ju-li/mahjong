import type { Difficulty } from '@mahjong/bots'
import type { Action, Player, PlayerView, RuleSet } from '@mahjong/engine'

/** Name of the Colyseus room type every table uses. */
export const ROOM_NAME = 'table'

/** Longest display name the server keeps. */
export const MAX_NAME_LENGTH = 16

/** Claim timer choices for online tables. Unlike solo play there is no "off": one idle player would stall everyone. */
export const ONLINE_CLAIM_SECONDS = [20, 40, 60, 120] as const
export type OnlineClaimSeconds = (typeof ONLINE_CLAIM_SECONDS)[number]

/** Options for `client.create` / `client.joinById`. */
export type JoinOptions = {
  name?: string
  /** Seed of the avatar this player picked. */
  avatar?: number
  /** Seat token from an earlier join: reclaims that seat (or the one you last left), even mid-match. */
  token?: string
  /** Logto access token of a signed-in player; absent or invalid = guest. Never needed to play. */
  accessToken?: string
}

export type TableSettings = {
  rules: RuleSet
  difficulty: Difficulty
  claimSeconds: OnlineClaimSeconds
}

/** One of the four players. `name` null = a bot sits there. */
export type PlayerSlot = {
  name: string | null
  /** Avatar seed the player picked; null = one dealt from the match. */
  avatar: number | null
  /** A human is at the table right now (a dropped human's seat is played by a bot until they return). */
  connected: boolean
  /** Account of a signed-in player (server-verified), so others can add them as a friend; null = guest or bot. */
  userId: string | null
}

/** The match part of a snapshot. Never includes the match seed: every hand's wall derives from it. */
export type MatchInfo = {
  /** Seeds the avatars only. */
  avatarSeed: number
  handIndex: number
  /** Totals per player before the hand in play. */
  scores: number[]
  /** `seatPlayers[seat]` = player sitting there this round. */
  seatPlayers: Player[]
  over: boolean
  /** Bumps on every applied action; an `act` must quote it so stale clicks are dropped. */
  step: number
  /** This player's view of the hand, or null once the match is over. */
  view: PlayerView | null
  /** What this player may do now. Empty while waiting on others. */
  legal: Action[]
  /** Milliseconds left to answer the current claim, or null when no timer runs for you. */
  claimMs: number | null
  /** Per player: has said they are ready for the next hand. */
  ready: boolean[]
  /** Between hands, every human at the table is ready: the host may deal the next one. */
  allReady: boolean
  /** The last hand has been scored: the host chooses to keep going or go back to the lobby. */
  final: boolean
  /** Who paused play, or null while it runs. While paused nothing moves and no timer runs. */
  paused: Player | null
}

/** Server → client, message type `snapshot`: everything one player may see. */
export type Snapshot = {
  code: string
  phase: 'lobby' | 'playing'
  /** Which player you are. */
  you: Player
  /** Seat token to keep so you can return to this table. */
  token: string
  host: Player
  players: PlayerSlot[]
  settings: TableSettings
  match: MatchInfo | null
}

/** Client → server messages. */
export type ClientMessages = {
  act: { step: number; action: Action }
  /** Between hands: ready for the next one. */
  ready: Record<string, never>
  /** Between hands: take back your ready. */
  unready: Record<string, never>
  /** Host, once everyone is ready: deal the next hand. */
  deal: Record<string, never>
  /** Change your name and/or avatar. */
  profile: { name?: string; avatar?: number }
  configure: Partial<TableSettings>
  start: Record<string, never>
  /** Host, after the last hand: back to the lobby with the same people. */
  restart: Record<string, never>
  /** Host, after the last hand: another match straight away, same people and settings; `keepScores` carries the totals over. */
  rematch: { keepScores?: boolean }
  /** Anyone at the table: stop play for a break. */
  pause: Record<string, never>
  /** Anyone at the table: carry on. */
  resume: Record<string, never>
  /** Signed in or out while seated: the new access token, or null for guest. */
  identify: { accessToken: string | null }
  /** Host: remove the player in this seat from the table; they can't come back to it. */
  kick: { player: number }
}

/** Close code when the host removes you, and the join error when you try to come back. */
export const KICKED_CODE = 4006

/** Colyseus room type signed-in players stay connected to for friends and online status. */
export const SOCIAL_ROOM = 'social'

/** What an account is called until the player picks a name (or signs in with one, e.g. Google). */
export const DEFAULT_PROFILE_NAME = 'Player'

/** Options for joining the social room. Guests can't: it needs a valid access token. */
export type SocialJoinOptions = {
  accessToken: string
  /** Name and avatar chosen as a guest; they seed the profile the first time an account signs in. */
  name?: string
  avatar?: number
}

export type FriendState = 'incoming' | 'outgoing' | 'friend'

export type Friend = {
  userId: string
  name: string
  avatar: number | null
  /** `incoming` = they asked you; `outgoing` = you asked them; `friend` = accepted. */
  state: FriendState
  /** Has the game open and is signed in right now. Only known for accepted friends. */
  online: boolean
  /** The online table an accepted friend is seated at, if any. Absent otherwise. */
  table?: FriendTable
}

/** Where a friend is playing: the table's code, how many seats someone new could take, and whether a match is on. */
export type FriendTable = { code: string; openSeats: number; playing: boolean }

/** Server → client on the social room, message type `friends`: your profile and everyone linked to you. */
export type FriendsSnapshot = {
  /** `table`: code of the table you are seated at, as friends see it; absent when at none. */
  me: { userId: string; name: string; avatar: number | null; friendCode: string; table?: string }
  friends: Friend[]
}

export type FriendError = 'self' | 'unknown' | 'limit'

/** Server → client, message type `inviteResult`: what opening a friend invite link did. */
export type InviteResult = { ok: true; name: string } | { ok: false; error: FriendError }

/** Server → client on the social room, message type `tableInvite`: a friend asks you to their table. */
export type TableInvite = { from: { userId: string; name: string; avatar: number | null }; code: string }

export type TableInviteError = 'offline' | 'full' | 'already' | 'notFriend' | 'notAtTable' | 'tooSoon'

/** Server → client, message type `tableInviteResult`: what sending a table invite did. */
export type TableInviteResult = { ok: true; name: string } | { ok: false; name: string | null; error: TableInviteError }

/** A player may invite the same friend at most once in this long. */
export const TABLE_INVITE_GAP_MS = 20_000

/** Client → server messages on the social room. */
export type SocialClientMessages = {
  friendRequest: { userId: string }
  friendRespond: { userId: string; accept: boolean }
  /** Unfriend, or withdraw / drop a request. */
  friendRemove: { userId: string }
  /** Opened someone's friend invite link. */
  acceptInvite: { code: string }
  /** Change your account's name and/or avatar. */
  profile: { name?: string; avatar?: number }
  /** Ask an online friend to the table you are seated at. */
  tableInvite: { userId: string; code: string }
  /** A finished solo match, for your own history and stats (never ranked). Answered by `soloSaved`. */
  soloResult: SoloResult
  /** A page of your match history, newest first; `before` = `endedAt` of the last one you have. Answered by `historyPage`. */
  history: { before?: number }
  /** One of your matches, hand by hand. Answered by `matchDetail`. */
  matchDetail: { id: string }
  /** Your stats. Answered by `stats`. */
  stats: Record<string, never>
}

// ---------------------------------------------------------------------------
// Match history, stats and rankings

/** How one hand ended, by player (not seat). */
export type HandOutcome =
  | { type: 'drawn' }
  | {
      type: 'win'
      winner: Player
      /** Who discarded the winning tile; null = self-drawn. */
      from: Player | null
      fans: { id: string; points: number; count: number }[]
      total: number
      flowerPoints: number
    }

export type HandSummary = {
  handIndex: number
  /** Player who dealt. */
  dealer: Player
  prevailingWind: 'E' | 'S' | 'W' | 'N'
  outcome: HandOutcome
  /** Point change per player. */
  deltas: number[]
}

/** Client → server: a solo match played on this device, once it is over. */
export type SoloResult = {
  rules: RuleSet
  difficulty: Difficulty
  /** Match seed: with the account, identifies the match so it is saved once. */
  seed: number
  /** Milliseconds since the epoch. */
  startedAt: number
  endedAt: number
  hands: HandSummary[]
  /** Final totals per player; the uploader is always player 0. */
  scores: number[]
}

/** Server → client: the solo match with this seed is stored (or was already), or can't be. */
export type SoloSaved = { seed: number; ok: boolean }

export type MatchPlayerSummary = {
  name: string
  avatar: number | null
  bot: boolean
  userId: string | null
  score: number
  placement: number
}

export type MatchSummary = {
  id: string
  kind: 'online' | 'solo'
  rules: RuleSet
  difficulty: Difficulty | null
  rated: boolean
  endedAt: number
  /** Which player you were. */
  you: Player
  players: MatchPlayerSummary[]
  /** Your displayed rating change from this match, if it was rated for you. */
  ratingChange: number | null
}

export type HistoryPage = { matches: MatchSummary[]; more: boolean }

export type MatchDetail = MatchSummary & { hands: HandSummary[] }

/** Server → client, message type `matchDetail`: the match asked for, or null if it isn't yours. */
export type MatchDetailReply = { id: string; match: MatchDetail | null }

export type RuleStats = {
  rules: RuleSet
  /** Displayed rating, or null before your first rated match. */
  rating: number | null
  /** Place on the leaderboard, or null until you qualify. */
  rank: number | null
  ratedMatches: number
  matches: number
  firsts: number
  avgPlacement: number | null
}

export type SoloStats = {
  difficulty: Difficulty
  matches: number
  firsts: number
  avgScore: number
  /** Your highest-scoring hand. */
  best: { total: number; fans: string[] } | null
}

export type PlayerStats = { online: RuleStats[]; solo: SoloStats[] }

/** Rated matches a player needs before appearing on the leaderboard. */
export const LEADERBOARD_MIN_MATCHES = 5

export type LeaderboardEntry = { rank: number; userId: string; name: string; avatar: number | null; rating: number; matches: number }

/** Public HTTP path: `GET /leaderboard?rules=mcr` → `{ entries: LeaderboardEntry[] }`. */
export const LEADERBOARD_PATH = '/leaderboard'

/** Server → client on a table, message type `rated`: your rating after a rated match. */
export type RatingChange = { rules: RuleSet; before: number; after: number }

/** HTTP path on the game server that emails player feedback to the developers. */
export const FEEDBACK_PATH = '/feedback'
export const MAX_FEEDBACK_MESSAGE = 5000
/** Diagnostics ride along as JSON attachments; the console log is the bulk of it. */
export const MAX_FEEDBACK_ATTACHMENT_BYTES = 400 * 1024

/** Body of a `POST /feedback`. */
export type FeedbackRequest = {
  name: string
  email: string
  message: string
  /** About the player's device and app: user agent, settings, recent console output. */
  diagnostics: unknown
  /** The game as of the report: enough to replay it. */
  game: unknown
  /** Code of the online table the player is at; the server adds its full copy of that game. */
  tableCode?: string
}
