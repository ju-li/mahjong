import { newHand, type NewHandOptions } from './deal'
import { applyAction } from './rules'
import type { Action, GameState, HandResult, MeldType, Seat } from './state'
import { seatWind } from './state'
import type { Tile, Wind } from './tiles'

/** A meld as another seat sees it: concealed kongs show no tiles. */
export type ViewMeld = {
  type: MeldType
  exposed: boolean
  tiles: Tile[] | null
  from?: Seat
  claimedTileId?: number
}

export type ViewPhase =
  | { kind: 'draw' }
  /** `drawnTileId` is only shown to the seat that drew it. */
  | { kind: 'discard'; drawnTileId: number | null; afterKong: boolean }
  /** `awaiting`: this seat still has to answer. Other seats' answers stay hidden. */
  | { kind: 'claim' | 'robKong'; tile: Tile; from: Seat; awaiting: boolean }
  /** At the end of a hand the winning hand is public. */
  | { kind: 'ended'; result: HandResult; winningHand: Tile[] | null }

/** Everything `seat` may know. Contains no other seat's concealed tiles, no wall order and no seed. */
export type PlayerView = {
  seat: Seat
  dealer: Seat
  prevailingWind: Wind
  seatWinds: Wind[]
  turn: Seat
  hand: Tile[]
  concealedCounts: number[]
  melds: ViewMeld[][]
  discards: Tile[][]
  flowers: Tile[][]
  wallCount: number
  phase: ViewPhase
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function viewFor(state: GameState, seat: Seat): PlayerView {
  const phase = state.phase
  let viewPhase: ViewPhase
  switch (phase.kind) {
    case 'draw':
      viewPhase = { kind: 'draw' }
      break
    case 'discard':
      viewPhase = {
        kind: 'discard',
        drawnTileId: state.turn === seat ? phase.drawnTileId : null,
        afterKong: phase.afterKong,
      }
      break
    case 'claim':
    case 'robKong':
      viewPhase = { kind: phase.kind, tile: phase.tile, from: phase.from, awaiting: phase.responses[seat] === null }
      break
    case 'ended': {
      const result = phase.result
      viewPhase = { kind: 'ended', result, winningHand: result.type === 'win' ? state.hands[result.winner]! : null }
      break
    }
  }

  return copy({
    seat,
    dealer: state.dealer,
    prevailingWind: state.prevailingWind,
    seatWinds: ([0, 1, 2, 3] as Seat[]).map((s) => seatWind(state, s)),
    turn: state.turn,
    hand: state.hands[seat]!,
    concealedCounts: state.hands.map((h) => h.length),
    melds: state.melds.map((melds, owner) =>
      melds.map((m): ViewMeld => ({ ...m, tiles: m.exposed || owner === seat ? m.tiles : null })),
    ),
    discards: state.discards,
    flowers: state.flowers,
    wallCount: state.wall.length,
    phase: viewPhase,
  })
}

/** Rebuild a hand from its starting point and action log. Same inputs always give the same state. */
export function replay(init: NewHandOptions | GameState, actions: readonly Action[]): GameState {
  let state = 'wall' in init ? init : newHand(init)
  for (const action of actions) state = applyAction(state, action)
  return state
}
