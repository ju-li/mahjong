import { MIN_FAN } from './scoring'
import type { HandScore, Seat } from './state'

/**
 * Point transfers for a won hand (MCR): the base is 8.
 * - Discard win: the discarder pays 8 + fan, each other loser pays 8.
 * - Self-draw: each of the three others pays 8 + fan.
 * Flowers count in `score.total`. The result always sums to zero.
 */
export function settle(result: { winner: Seat; from: Seat | null }, score: HandScore): number[] {
  const deltas = [0, 0, 0, 0]
  const full = MIN_FAN + score.total
  for (let seat = 0; seat < 4; seat++) {
    if (seat === result.winner) continue
    const pay = result.from === null || result.from === seat ? full : MIN_FAN
    deltas[seat] = -pay
    deltas[result.winner] += pay
  }
  return deltas
}
