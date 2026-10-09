import { ref } from 'vue'
import type { Seat, Tile } from '@mahjong/engine'

/** How long an opponent's discard stays in the middle of the screen before it goes back to its pond. */
export const SPOTLIGHT_HOLD_MS = 1000

export type Spot = {
  tile: Tile
  seat: Seat
  /** The player can claim it: it stays until they answer or the claim window closes. */
  held: boolean
  /** When it arrived (ms). */
  at: number
}

/**
 * The queue of opponents' discards shown big in the middle of the table. Discards that come in
 * faster than they are read wait side by side; each leaves `SPOTLIGHT_HOLD_MS` after it arrived,
 * unless it is held for a claim. `spotlit` also keeps the tiles still flying back, so their pond
 * copy stays hidden until they land (`landed`).
 */
export function useDiscardSpotlight(now: () => number = () => Date.now()) {
  const entries = ref<Spot[]>([])
  const spotlit = ref(new Set<number>())
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function stopTimer(id: number) {
    clearTimeout(timers.get(id))
    timers.delete(id)
  }

  function schedule(spot: Spot) {
    stopTimer(spot.tile.id)
    const wait = Math.max(0, spot.at + SPOTLIGHT_HOLD_MS - now())
    timers.set(
      spot.tile.id,
      setTimeout(() => dismiss(spot.tile.id), wait),
    )
  }

  function add(tile: Tile, seat: Seat, held = false) {
    if (entries.value.some((e) => e.tile.id === tile.id)) return
    const spot: Spot = { tile, seat, held, at: now() }
    entries.value = [...entries.value, spot]
    spotlit.value = new Set(spotlit.value).add(tile.id)
    if (!held) schedule(spot)
  }

  /** Hold the tile `id` (the one open for a claim, or none) and let every other one go. */
  function hold(id: number | null) {
    let changed = false
    const next = entries.value.map((e) => {
      const held = e.tile.id === id
      if (held === e.held) return e
      changed = true
      const spot = { ...e, held }
      if (held) stopTimer(e.tile.id)
      else schedule(spot)
      return spot
    })
    if (changed) entries.value = next
  }

  /** Send one tile back to its pond. */
  function dismiss(id: number) {
    stopTimer(id)
    if (entries.value.some((e) => e.tile.id === id)) entries.value = entries.value.filter((e) => e.tile.id !== id)
  }

  /** Send every tile back. */
  function dismissAll() {
    for (const e of entries.value) stopTimer(e.tile.id)
    entries.value = []
  }

  /** The tile has flown back: show its pond copy again. */
  function landed(id: number) {
    if (!spotlit.value.has(id)) return
    const next = new Set(spotlit.value)
    next.delete(id)
    spotlit.value = next
  }

  /** Forget everything at once (a new hand, leaving the table). */
  function reset() {
    dismissAll()
    spotlit.value = new Set()
  }

  return { entries, spotlit, add, hold, dismiss, dismissAll, landed, reset }
}
