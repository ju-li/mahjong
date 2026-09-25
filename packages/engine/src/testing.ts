import type { Action, GameState, Seat } from './state'
import { isFlower } from './tiles'
import { mulberry32 } from './rng'
import { applyAction, legalActions } from './rules'
import { newHand } from './deal'

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

/** Seats that currently have at least one legal action, lowest first. */
export function actingSeats(state: GameState): Seat[] {
  return ([0, 1, 2, 3] as Seat[]).filter((seat) => legalActions(state, seat).length > 0)
}

export type RandomPlayOptions = {
  /** Called after every transition with the new state. */
  onState?: (state: GameState, action: Action) => void
  /** Probability of choosing a non-pass, non-discard action when one exists. */
  claimBias?: number
}

/** Play one hand with seeded random legal actions. Returns final state and the action log. */
export function playRandomHand(seed: number, options: RandomPlayOptions = {}): { state: GameState; actions: Action[] } {
  const rand = mulberry32(seed ^ 0x5eed)
  let state = newHand({ seed, dealer: (seed & 3) as Seat, prevailingWind: 'E' })
  const actions: Action[] = []
  for (let step = 0; state.phase.kind !== 'ended'; step++) {
    if (step > 2000) throw new Error('hand did not terminate')
    const seat = actingSeats(state)[0]!
    const legal = legalActions(state, seat)
    const special = legal.filter((a) => a.type !== 'pass' && a.type !== 'discard' && a.type !== 'draw')
    const pool = special.length > 0 && rand() < (options.claimBias ?? 0.5) ? special : legal
    const action = pool[Math.floor(rand() * pool.length)]!
    state = applyAction(state, action)
    actions.push(action)
    options.onState?.(state, action)
  }
  return { state, actions }
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}
