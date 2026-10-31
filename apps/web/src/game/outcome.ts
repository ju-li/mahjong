import type { HandResult, Seat } from '@mahjong/engine'

/**
 * How the hand went for `seat`: decides the summary banner. `other` = someone else won and the win
 * cost you nothing (e.g. Singapore, where only the discarder pays) — it is not a drawn hand.
 */
export type HandOutcome = 'win' | 'loss' | 'draw' | 'other'

export function handOutcome(result: HandResult, seat: Seat): HandOutcome {
  if (result.type === 'drawn') return 'draw'
  const mine = result.deltas[seat]!
  return mine > 0 ? 'win' : mine < 0 ? 'loss' : 'other'
}
