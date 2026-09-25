import { shuffle } from './rng'
import { DEFAULT_RULES, type RuleSet } from './ruleset'
import type { GameState, Seat } from './state'
import { nextSeat } from './state'
import { createWall, isFlower, type Tile, type Wind } from './tiles'

export type NewHandOptions = {
  seed: number
  dealer: Seat
  prevailingWind: Wind
  /** Defaults to MCR. */
  rules?: RuleSet
}

/** Draw from the back of the wall (replacement for flowers and kongs). */
export function drawReplacement(wall: Tile[]): Tile | undefined {
  return wall.pop()
}

/** Move every flower in `seat`'s hand aside, replacing each from the back of the wall until none remain. */
export function replaceFlowers(state: GameState, seat: Seat): void {
  const hand = state.hands[seat]!
  for (;;) {
    const index = hand.findIndex((t) => isFlower(t.kind))
    if (index < 0) return
    state.flowers[seat]!.push(hand.splice(index, 1)[0]!)
    const replacement = drawReplacement(state.wall)
    if (!replacement) return
    hand.push(replacement)
  }
}

/** Shuffle, deal 13 to each seat and a 14th to the dealer, then replace flowers starting with the dealer. */
export function newHand({ seed, dealer, prevailingWind, rules = DEFAULT_RULES }: NewHandOptions): GameState {
  const wall = shuffle(createWall(), seed)
  const state: GameState = {
    rules,
    seed,
    dealer,
    prevailingWind,
    wall,
    hands: [[], [], [], []],
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    flowers: [[], [], [], []],
    turn: dealer,
    phase: { kind: 'discard', drawnTileId: null, afterKong: false },
  }

  let seat = dealer
  for (let i = 0; i < 4; i++) {
    state.hands[seat]!.push(...wall.splice(0, 13))
    seat = nextSeat(seat)
  }
  state.hands[dealer]!.push(wall.shift()!)

  seat = dealer
  for (let i = 0; i < 4; i++) {
    replaceFlowers(state, seat)
    seat = nextSeat(seat)
  }
  for (const hand of state.hands) hand.sort((a, b) => a.id - b.id)
  return state
}
