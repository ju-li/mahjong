import { shallowRef } from 'vue'
import type { Player } from '@mahjong/engine'
import { REACTION_BURST, REACTION_WINDOW_MS, type ReactionId } from '@mahjong/protocol'

/** What each reaction looks like on screen. */
export const REACTION_EMOJI: Record<ReactionId, string> = {
  fire: '🔥',
  clap: '👏',
  heart: '❤️',
  laugh: '😂',
  party: '🎉',
}

/** How long a reaction floats before it is gone; matches the `reaction-rise` animation. */
export const FLOAT_MS = 2400
/** Most reactions on screen at once; older ones make way under a flood. */
export const MAX_FLOATING = 30

/** One emoji on its way up from a player's badge. */
export type FloatingReaction = {
  id: number
  player: Player
  reaction: ReactionId
  /** Sideways sway, -1 to 1, so a burst spreads out instead of stacking. */
  drift: number
}

/** Reactions floating up from the players who sent them, each gone after `FLOAT_MS`. */
export function useReactionFeed(random: () => number = Math.random) {
  const floating = shallowRef<FloatingReaction[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 1

  function remove(id: number): void {
    clearTimeout(timers.get(id))
    timers.delete(id)
    floating.value = floating.value.filter((r) => r.id !== id)
  }

  function push(player: Player, reaction: ReactionId): void {
    const id = nextId++
    const list = [...floating.value, { id, player, reaction, drift: random() * 2 - 1 }]
    for (const old of list.splice(0, Math.max(0, list.length - MAX_FLOATING))) {
      clearTimeout(timers.get(old.id))
      timers.delete(old.id)
    }
    floating.value = list
    timers.set(id, setTimeout(() => remove(id), FLOAT_MS))
  }

  function clear(): void {
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    floating.value = []
  }

  return { floating, push, clear }
}

/** Whether you may send another reaction now, keeping to the server's limit so none are silently dropped. */
export function reactionThrottle(now: () => number = Date.now) {
  let sent: number[] = []
  return () => {
    const t = now()
    sent = sent.filter((s) => s > t - REACTION_WINDOW_MS)
    if (sent.length >= REACTION_BURST) return false
    sent.push(t)
    return true
  }
}
