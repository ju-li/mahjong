import type { Ref } from 'vue'
import type { Action, HouseRules, Player, PlayerView, RuleSet } from '@mahjong/engine'
import type { ReactionId, TableSettings, VoiceClip } from '@mahjong/protocol'
import type { FloatingReaction } from './reactions'

/**
 * What the table screen needs from a match, whoever runs it: `useMatch` (this device, vs bots)
 * or `useOnlineMatch` (the game server). Everything is from one player's point of view.
 */
export type MatchSource = {
  /** This seat's view of the hand in play, or null once the match is over. */
  view: Readonly<Ref<PlayerView | null>>
  /** What this seat may do now. */
  actions: Readonly<Ref<Action[]>>
  /** `seatPlayers[seat]` = player sitting there this round. */
  seatPlayers: Readonly<Ref<Player[]>>
  /** Display name per player. */
  playerNames: Readonly<Ref<string[]>>
  /** Match totals per player, before the hand in play. */
  scores: Readonly<Ref<number[]>>
  /** Seeds each player's avatar for the whole match. */
  matchSeed: Readonly<Ref<number>>
  /** Avatar seed a player picked, per player; null = a face dealt from `matchSeed`. */
  avatarChoices: Readonly<Ref<(number | null)[]>>
  /** 0-based hand number within the match. */
  handIndex: Readonly<Ref<number>>
  rules: Readonly<Ref<RuleSet>>
  /** House rules the table plays now (the hand in play, or the next one between matches). */
  house: Readonly<Ref<HouseRules>>
  /** Seconds left to claim, or null when no timer is running. */
  claimRemaining: Readonly<Ref<number | null>>
  matchOver: Readonly<Ref<boolean>>
  /** Between hands online: who is ready and what your button does; null otherwise (online only). */
  readiness?: Readonly<Ref<Readiness | null>>
  /** Who paused play, by display name; null while it runs (online only). */
  pausedBy?: Readonly<Ref<string | null>>
  /** Player whose voice memo is playing right now (online only). */
  speaking?: Readonly<Ref<Player | null>>
  /** Which of voice memos and reactions the host allows at this table (online only). */
  chat?: Readonly<Ref<Pick<TableSettings, 'voiceChat' | 'reactions'>>>
  /** Emoji reactions floating up from whoever sent them, yours included (online only). */
  reactions?: Readonly<Ref<FloatingReaction[]>>
  act(action: Action): void
  /** Send an emoji reaction to everyone at the table (online only). */
  react?(reaction: ReactionId): void
  /** Send a voice memo to everyone at the table (online only). */
  sendVoice?(clip: VoiceClip): void
  /** Offline: deal the next hand. Online: say you are ready for it. */
  continueToNextHand(): void
  /** Take back your ready (online only). */
  unready?(): void
  /** Host, once everyone is ready: deal the next hand (online only). */
  deal?(): void
}

/**
 * Your button between online hands: `ready` → `notReady` (take it back) for everyone; the host
 * instead sees `waiting` until every human is ready, then `start`.
 */
export type ReadyButton = 'ready' | 'notReady' | 'waiting' | 'start'

export type Readiness = {
  /** Per player: ready for the next hand. Bots and players who are away never hold the table up. */
  ready: boolean[]
  button: ReadyButton
}
