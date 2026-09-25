import type { Tile, Wind } from './tiles'

/** Seats in turn order. Play passes from seat n to seat (n + 1) % 4. */
export type Seat = 0 | 1 | 2 | 3
export const SEATS: readonly Seat[] = [0, 1, 2, 3]

export type SeatWind = Wind

export type MeldType = 'chow' | 'pung' | 'kong'

/**
 * A declared set. `exposed` is false only for concealed kongs.
 * `from` is the seat whose discard was claimed; `claimedTileId` is that tile.
 */
export type Meld = {
  type: MeldType
  tiles: Tile[]
  exposed: boolean
  from?: Seat
  claimedTileId?: number
}

export type Action =
  | { type: 'draw'; seat: Seat }
  | { type: 'discard'; seat: Seat; tileId: number }
  | { type: 'chow'; seat: Seat; tileIds: [number, number] }
  | { type: 'pung'; seat: Seat }
  /** No `tileIds`: exposed kong on a discard. 4 ids: concealed kong. 1 id: promote a pung. */
  | { type: 'kong'; seat: Seat; tileIds?: number[] }
  | { type: 'win'; seat: Seat }
  | { type: 'pass'; seat: Seat }

export type ActionType = Action['type']

/** Filled in by scoring; kept structural here so `state.ts` has no scoring dependency. */
export type HandScore = {
  fans: { name: string; points: number; count: number }[]
  total: number
  flowerPoints: number
}

export type HandResult =
  | { type: 'drawn' }
  | { type: 'win'; winner: Seat; from: Seat | null; tileId: number; score: HandScore; deltas: number[] }

/** Pending replies to a discard (or to a promoted kong that can be robbed). `null` = not answered yet. */
export type ClaimWindow = {
  tile: Tile
  from: Seat
  responses: (Action | null)[]
}

export type Phase =
  /** `turn` must draw. */
  | { kind: 'draw' }
  /** `turn` holds 14 (kongs counted as 3) and must discard, kong or win. */
  | { kind: 'discard'; drawnTileId: number | null; afterKong: boolean }
  /** Other seats answer a discard. */
  | ({ kind: 'claim' } & ClaimWindow)
  /** Other seats may rob a promoted kong. `meldIndex` is the pung being promoted. */
  | ({ kind: 'robKong'; meldIndex: number } & ClaimWindow)
  | { kind: 'ended'; result: HandResult }

/** One hand of MCR. Plain JSON: no classes, functions or cycles. */
export type GameState = {
  seed: number
  dealer: Seat
  prevailingWind: Wind
  /** Front (index 0) is the next draw; replacement draws come from the back. */
  wall: Tile[]
  hands: Tile[][]
  melds: Meld[][]
  discards: Tile[][]
  flowers: Tile[][]
  turn: Seat
  phase: Phase
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat
}

/** Seat wind: the dealer is East, then South, West, North in turn order. */
export function seatWind(state: Pick<GameState, 'dealer'>, seat: Seat): SeatWind {
  const winds: readonly Wind[] = ['E', 'S', 'W', 'N']
  return winds[(seat - state.dealer + 4) % 4]!
}
