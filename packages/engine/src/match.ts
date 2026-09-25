import { newHand } from './deal'
import { mulberry32 } from './rng'
import type { GameState, HandResult, Seat } from './state'
import { WINDS, type Wind } from './tiles'

/** A full MCR match: four prevailing winds × four hands. The dealer rotates every hand. */
export const HANDS_PER_MATCH = 16

export type HandRecord = {
  handIndex: number
  dealer: Seat
  prevailingWind: Wind
  result: HandResult
}

export type Match = {
  seed: number
  /** Index of the hand being played, 0..15; equals 16 once the match is over. */
  handIndex: number
  /** Cumulative points per seat. Always sums to zero. */
  scores: number[]
  history: HandRecord[]
  /** The hand in progress; null once the match is over. */
  current: GameState | null
}

/** Deterministic per-hand seed derived from the match seed. */
export function handSeed(matchSeed: number, handIndex: number): number {
  return Math.floor(mulberry32((matchSeed ^ Math.imul(handIndex + 1, 0x9e3779b9)) >>> 0)() * 2 ** 32)
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
  return { seed, handIndex: 0, scores: [0, 0, 0, 0], history: [], current: startHand(seed, 0) }
}

export function isMatchOver(match: Match): boolean {
  return match.handIndex >= HANDS_PER_MATCH
}

/** Record the finished hand's result and deal the next hand (or end the match). Returns a new match. */
export function nextHand(match: Match, result: HandResult): Match {
  if (isMatchOver(match)) throw new Error('match is already over')
  const deltas = result.type === 'win' ? result.deltas : [0, 0, 0, 0]
  const handIndex = match.handIndex + 1
  return {
    seed: match.seed,
    handIndex,
    scores: match.scores.map((s, i) => s + deltas[i]!),
    history: [
      ...match.history,
      { handIndex: match.handIndex, dealer: dealerFor(match.handIndex), prevailingWind: prevailingWindFor(match.handIndex), result },
    ],
    current: handIndex < HANDS_PER_MATCH ? startHand(match.seed, handIndex) : null,
  }
}
