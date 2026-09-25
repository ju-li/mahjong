import { FAN_BY_ID, FANS, type FanId } from './fans'
import { HK_FAN_BY_ID, HK_FANS, HK_MIN_FAAN, meetsMinimumHK, scoreHandHK, settleHK, type HkFanId } from './hk'
import { MIN_FAN, meetsMinimum, scoreHand, type WinContext } from './scoring'
import { settle } from './settle'
import type { HandScore, Seat } from './state'

/** Playable rule sets: Mahjong Competition Rules (Chinese Official) and Hong Kong. */
export type RuleSet = 'mcr' | 'hk'
export const RULE_SETS: readonly RuleSet[] = ['mcr', 'hk']
export const DEFAULT_RULES: RuleSet = 'mcr'

export function isRuleSet(value: unknown): value is RuleSet {
  return RULE_SETS.includes(value as RuleSet)
}

/** A scoring element of either rule set, as the fan list shows it. */
export type RuleFanDef = {
  id: string
  name: string
  chinese: string
  points: number
  excludes: readonly string[]
  description: { en: string; zh: string }
}

/** Every fan (MCR) or faan (Hong Kong) element of a rule set. */
export function fansFor(rules: RuleSet): readonly RuleFanDef[] {
  return rules === 'hk' ? HK_FANS : FANS
}

/** Look up a scoring element by id in either rule set. Hong Kong ids start with `hk.`. */
export function fanDef(id: string): RuleFanDef | undefined {
  return id.startsWith('hk.') ? HK_FAN_BY_ID[id as HkFanId] : FAN_BY_ID[id as FanId]
}

/** Points needed to win: MCR 8 fan (flowers excluded), Hong Kong 3 faan (flowers included). */
export function minimumFor(rules: RuleSet): number {
  return rules === 'hk' ? HK_MIN_FAAN : MIN_FAN
}

/** Score of a complete hand under `rules`, or null when the tiles are not a winning shape. */
export function scoreFor(rules: RuleSet, ctx: WinContext): HandScore | null {
  return rules === 'hk' ? scoreHandHK(ctx) : scoreHand(ctx)
}

/** The score is enough to declare a win under `rules`. */
export function meetsMinimumFor(rules: RuleSet, score: HandScore): boolean {
  return rules === 'hk' ? meetsMinimumHK(score) : meetsMinimum(score)
}

/** Point transfers for a win under `rules`; always sums to zero. */
export function settleFor(rules: RuleSet, result: { winner: Seat; from: Seat | null }, score: HandScore): number[] {
  return rules === 'hk' ? settleHK(result, score) : settle(result, score)
}
