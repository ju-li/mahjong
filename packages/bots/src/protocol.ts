import type { Action, PlayerView } from '@mahjong/engine'

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard'

/** Every bot level, easiest first. */
export const DIFFICULTIES: readonly Difficulty[] = ['beginner', 'easy', 'medium', 'hard']

/** Main thread → bot worker. `id` pairs a reply with its request. */
export type BotRequest = {
  id: number
  view: PlayerView
  legal: Action[]
  difficulty: Difficulty
  seed: number
}

/** Bot worker → main thread. */
export type BotResponse = {
  id: number
  action: Action
}
