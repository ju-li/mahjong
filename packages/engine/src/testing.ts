import type { GameState } from './state'
import { isFlower } from './tiles'

/** Every tile id 0..143 appears exactly once across wall, hands, melds, discards, flowers and any pending claim tile. */
export function tileIdsInPlay(state: GameState): number[] {
  const ids: number[] = []
  ids.push(...state.wall.map((t) => t.id))
  for (let s = 0; s < 4; s++) {
    ids.push(...state.hands[s]!.map((t) => t.id))
    for (const m of state.melds[s]!) ids.push(...m.tiles.map((t) => t.id))
    ids.push(...state.discards[s]!.map((t) => t.id))
    ids.push(...state.flowers[s]!.map((t) => t.id))
  }
  return ids
}

export function expectConservation(state: GameState): void {
  const ids = tileIdsInPlay(state).sort((a, b) => a - b)
  if (ids.length !== 144 || ids.some((id, i) => id !== i)) {
    throw new Error(`tile conservation broken: ${ids.length} ids`)
  }
}

/** Concealed tiles + melded tiles, each kong counted as 3. */
export function effectiveSize(state: GameState, seat: number): number {
  return state.hands[seat]!.length + state.melds[seat]!.length * 3
}

export function expectNoFlowersInHands(state: GameState): void {
  for (const hand of state.hands) {
    if (hand.some((t) => isFlower(t.kind))) throw new Error('flower left in hand')
  }
}
