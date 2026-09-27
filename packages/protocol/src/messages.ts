import type { Difficulty } from '@mahjong/bots'
import type { Action, Player, PlayerView, RuleSet } from '@mahjong/engine'

/** Name of the Colyseus room type every table uses. */
export const ROOM_NAME = 'table'

/** Longest display name the server keeps. */
export const MAX_NAME_LENGTH = 16

/** Longest voice memo a player may send. */
export const MAX_VOICE_MS = 15_000
/** Biggest voice memo the server relays; 15 s of 32 kbps Opus is about 60 KB. */
export const MAX_VOICE_BYTES = 256 * 1024

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

/** A recorded voice clip: what a player sends, minus who they are. */
export type VoiceClip = {
  /** Container type from the recorder, e.g. `audio/webm;codecs=opus`. */
  mime: string
  /** Length of the clip in milliseconds. */
  ms: number
  data: Uint8Array
}

/** Server → client, message type `voice`: another player's voice memo, to play straight away. */
export type VoiceMemo = VoiceClip & { from: Player }

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
  /** Host, after the last hand: another match straight away, same people and settings. */
  rematch: Record<string, never>
  /** Anyone at the table: stop play for a break. */
  pause: Record<string, never>
  /** Anyone at the table: carry on. */
  resume: Record<string, never>
  /** Anyone at the table: a push-to-talk memo for everyone else. */
  voice: VoiceClip
}
