import type { WinContext } from './scoring'
import { countsOf } from './shapes'
import type { Wind } from './tiles'

/** Kind-index helpers shared by the Hong Kong and Singapore scorers (see `kindIndex` for the layout). */

export const WIND_INDEX: Record<Wind, number> = { E: 27, S: 28, W: 29, N: 30 }
/** Own flower and season numbers by seat wind: East 1 / 5, South 2 / 6, West 3 / 7, North 4 / 8. */
export const SEAT_NUMBER: Record<Wind, number> = { E: 1, S: 2, W: 3, N: 4 }
export const isHonor = (k: number) => k >= 27
export const isWind = (k: number) => k >= 27 && k <= 30
export const isDragon = (k: number) => k >= 31
export const isTerminal = (k: number) => k < 27 && (k % 9 === 0 || k % 9 === 8)
export const suitOf = (k: number) => (k < 27 ? Math.floor(k / 9) : 3)

/** A set of the hand, declared or read from the concealed tiles. */
export type HSet = { type: 'chow' | 'pung' | 'kong'; index: number; concealed: boolean }

export const setKinds = (s: { type: string; index: number }): number[] =>
  s.type === 'chow' ? [s.index, s.index + 1, s.index + 2] : new Array<number>(s.type === 'kong' ? 4 : 3).fill(s.index)

/** 1112345678999 of one suit, concealed, plus any tile of that suit. */
export function isNineGates(ctx: WinContext): boolean {
  if (ctx.melds.length > 0) return false
  const before = countsOf(ctx.concealed)
  before[ctx.winTile]!--
  const suit = suitOf(ctx.winTile)
  if (suit > 2) return false
  const pattern = [3, 1, 1, 1, 1, 1, 1, 1, 3]
  return before.every((c, k) => (suitOf(k) === suit ? c === pattern[k % 9] : c === 0))
}
