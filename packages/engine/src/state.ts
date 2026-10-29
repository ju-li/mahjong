import type { HouseRules } from './house'
import type { RuleSet } from './ruleset'
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
  fans: { id: string; name: string; points: number; count: number }[]
  total: number
  flowerPoints: number
}

/**
 * Singapore instant payouts (咬): an animal pair, all four animals, own flower and season (wedding), a complete
 * flower or season set, or a kong. Each other seat pays `units` to `seat` the moment it happens; `deltas` is that
 * transfer (sums to zero). `opening`: a pair completed during the deal, paid double.
 */
export type BiteKind = 'catMouse' | 'roosterCentipede' | 'allAnimals' | 'wedding' | 'flowerSet' | 'seasonSet' | 'meldedKong' | 'concealedKong'
export type Bite = { seat: Seat; kind: BiteKind; units: number; deltas: number[]; opening?: boolean }

/**
 * `deltas` is the win settlement. `bonus` (Singapore) is the sum of the hand's bites per seat; it is paid on
 * a drawn hand too. A hand's total is `deltas + bonus`.
 */
export type HandResult =
  | { type: 'drawn'; bonus?: number[] }
  | { type: 'win'; winner: Seat; from: Seat | null; tileId: number; score: HandScore; deltas: number[]; bonus?: number[] }

/** Pending replies to a discard (or to a promoted kong that can be robbed). `null` = not answered yet. */
export type ClaimWindow = {
  tile: Tile
  from: Seat
  responses: (Action | null)[]
}

export type Phase =
  /** `turn` must draw. */
  | { kind: 'draw' }
  /**
   * `turn` holds 14 (kongs counted as 3) and must discard, kong or win. `afterBonus`: the drawn tile replaced
   * a flower or animal (absent in older states = false).
   */
  | { kind: 'discard'; drawnTileId: number | null; afterKong: boolean; afterBonus?: boolean }
  /** Other seats answer a discard. */
  | ({ kind: 'claim' } & ClaimWindow)
  /** Other seats may rob a promoted kong. `meldIndex` is the pung being promoted. */
  | ({ kind: 'robKong'; meldIndex: number } & ClaimWindow)
  | { kind: 'ended'; result: HandResult }

/** One hand. Plain JSON: no classes, functions or cycles. */
export type GameState = {
  /** Which rules score and settle this hand. */
  rules: RuleSet
  /** House rules for `rules`; fixed for the whole hand. */
  house: HouseRules
  seed: number
  dealer: Seat
  prevailingWind: Wind
  /** Front (index 0) is the next draw; replacement draws come from the back. */
  wall: Tile[]
  hands: Tile[][]
  melds: Meld[][]
  discards: Tile[][]
  flowers: Tile[][]
  /** Singapore bites paid so far this hand, in order. Absent (or empty) for other rule sets. */
  bites?: Bite[]
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
