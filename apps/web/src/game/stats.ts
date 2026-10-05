import type { SoloResult } from '@mahjong/protocol'

/** Finished solo matches waiting to be saved to the player's account (kept for guests until they sign in). */
const QUEUE_KEY = 'mahjong.pendingResults'
/** Keep at most this many; the oldest go first. */
export const MAX_PENDING = 50

export function readQueue(): SoloResult[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? (raw as SoloResult[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: SoloResult[]): void {
  try {
    if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    else localStorage.removeItem(QUEUE_KEY)
  } catch {
    // No storage: this match just isn't saved.
  }
}

/** The queue with `result` added (replacing the same match), capped to the newest `MAX_PENDING`. */
export function withResult(queue: readonly SoloResult[], result: SoloResult): SoloResult[] {
  return [...queue.filter((r) => r.seed !== result.seed), result].slice(-MAX_PENDING)
}

export function enqueueResult(result: SoloResult): void {
  writeQueue(withResult(readQueue(), result))
}

/** The server has dealt with the match with this seed (saved it, or refused it for good). */
export function dequeueResult(seed: number): void {
  writeQueue(readQueue().filter((r) => r.seed !== seed))
}

/** "+22", "−8", "±0": a rating change as players read it. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0'
}

/** Share of `part` in `total` as a whole percentage; "–" when there is nothing to divide. */
export function percent(part: number, total: number): string {
  return total > 0 ? `${Math.round((100 * part) / total)}%` : '–'
}
