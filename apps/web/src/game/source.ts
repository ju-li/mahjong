import type { Ref } from 'vue'
import type { Action, Player, PlayerView, RuleSet } from '@mahjong/engine'

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
  /** 0-based hand number within the match. */
  handIndex: Readonly<Ref<number>>
  rules: Readonly<Ref<RuleSet>>
  /** Seconds left to claim, or null when no timer is running. */
  claimRemaining: Readonly<Ref<number | null>>
  matchOver: Readonly<Ref<boolean>>
  act(action: Action): void
  continueToNextHand(): void
}
