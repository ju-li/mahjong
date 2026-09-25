import { newHand } from './deal'
import { mulberry32 } from './rng'
import type { GameState, HandResult, Seat } from './state'
import { WINDS, type Wind } from './tiles'

/** A full MCR match: four prevailing winds × four hands. The dealer rotates every hand. */
export const HANDS_PER_MATCH = 16

/** Fixed identity of a participant (0..3). Players change table seats between rounds; seats do not. */
export type Player = 0 | 1 | 2 | 3

/**
 * Official MCR re-seating (competition rule, "方式B"): seats are named by where they sit at the
 * start of a round (E, S, W, N = table seats 0..3).
 * - Before round 2: E ↔ S, W ↔ N.
 * - Before round 3: E → W, S → N, W → S, N → E.
 * - Before round 4: E ↔ S, W ↔ N.
 * Every player sits in each position once and deals once per round.
 * Source: http://www.gametea.com/ask/201701/4693.html (国标麻将规则要点, point 3).
 * `SEATING[round][seat]` is the player at that seat.
 */
export const SEATING: readonly (readonly Player[])[] = [
  [0, 1, 2, 3],
  [1, 0, 3, 2],
  [2, 3, 1, 0],
  [3, 2, 0, 1],
]

export type HandRecord = {
  handIndex: number
  dealer: Seat
  prevailingWind: Wind
  /** `seating[seat]` = player for this hand. */
  seating: Player[]
  /** Seat-indexed result, as the engine produced it. */
  result: HandResult
  /** Player-indexed point changes. */
  playerDeltas: number[]
}

export type Match = {
  seed: number
  /** Index of the hand being played, 0..15; equals 16 once the match is over. */
  handIndex: number
  /** Cumulative points per player. Always sums to zero. */
  scores: number[]
  /** `seating[seat]` = player sitting there for the current round. */
  seating: Player[]
  history: HandRecord[]
  /** The hand in progress; null once the match is over. */
  current: GameState | null
}

/** Deterministic per-hand seed derived from the match seed. */
export function handSeed(matchSeed: number, handIndex: number): number {
  return Math.floor(mulberry32((matchSeed ^ Math.imul(handIndex + 1, 0x9e3779b9)) >>> 0)() * 2 ** 32)
}

export function seatingFor(handIndex: number): Player[] {
  return [...SEATING[Math.min(3, Math.floor(handIndex / 4))]!]
}

/** Table seat of `player` in the current round. */
export function seatOf(match: Pick<Match, 'seating'>, player: Player): Seat {
  return match.seating.indexOf(player) as Seat
}

/** Player at table `seat` in the current round. */
export function playerAt(match: Pick<Match, 'seating'>, seat: Seat): Player {
  return match.seating[seat]!
}

export function dealerFor(handIndex: number): Seat {
  return (handIndex % 4) as Seat
}

export function prevailingWindFor(handIndex: number): Wind {
  return WINDS[Math.floor(handIndex / 4)]!
}

function startHand(matchSeed: number, handIndex: number): GameState {
  return newHand({ seed: handSeed(matchSeed, handIndex), dealer: dealerFor(handIndex), prevailingWind: prevailingWindFor(handIndex) })
}

export function newMatch(seed: number): Match {
  return { seed, handIndex: 0, scores: [0, 0, 0, 0], seating: seatingFor(0), history: [], current: startHand(seed, 0) }
}

export function isMatchOver(match: Match): boolean {
  return match.handIndex >= HANDS_PER_MATCH
}

/** Convert a seat-indexed delta array to player order using the hand's seating. */
export function toPlayerOrder(seating: readonly Player[], bySeat: readonly number[]): number[] {
  const out = [0, 0, 0, 0]
  bySeat.forEach((v, seat) => {
    out[seating[seat]!] = v
  })
  return out
}

/** Record the finished hand's result and deal the next hand (or end the match). Returns a new match. */
export function nextHand(match: Match, result: HandResult): Match {
  if (isMatchOver(match)) throw new Error('match is already over')
  const seatDeltas = result.type === 'win' ? result.deltas : [0, 0, 0, 0]
  const playerDeltas = toPlayerOrder(match.seating, seatDeltas)
  const handIndex = match.handIndex + 1
  return {
    seed: match.seed,
    handIndex,
    scores: match.scores.map((s, p) => s + playerDeltas[p]!),
    seating: handIndex < HANDS_PER_MATCH ? seatingFor(handIndex) : match.seating,
    history: [
      ...match.history,
      {
        handIndex: match.handIndex,
        dealer: dealerFor(match.handIndex),
        prevailingWind: prevailingWindFor(match.handIndex),
        seating: [...match.seating],
        result,
        playerDeltas,
      },
    ],
    current: handIndex < HANDS_PER_MATCH ? startHand(match.seed, handIndex) : null,
  }
}
