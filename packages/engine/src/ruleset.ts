import { FAN_BY_ID, FANS, type FanId } from './fans'
import { hkFansFor, HK_FAN_BY_ID, hkBasePoints, hkPayments, meetsMinimumHK, scoreHandHK, settleHK, type HkFanId } from './hk'
import { houseOf, type RuleConfig } from './house'
import { meetsMinimum, MIN_FAN, scoreHand, type WinContext } from './scoring'
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

const hk = (config: RuleConfig) => houseOf({ rules: 'hk', house: config.house })
const mcr = (config: RuleConfig) => houseOf({ rules: 'mcr', house: config.house })

/** Every fan (MCR) or faan (Hong Kong) element a table with `config` can score, with its value there. */
export function fansFor(config: RuleConfig): readonly RuleFanDef[] {
  if (config.rules === 'hk') return hkFansFor(hk(config))
  return mcr(config).flowers ? FANS : FANS.filter((f) => f.id !== 'flowerTiles')
}

/** Look up a scoring element by id in either rule set. Hong Kong ids start with `hk.`. */
export function fanDef(id: string): RuleFanDef | undefined {
  return id.startsWith('hk.') ? HK_FAN_BY_ID[id as HkFanId] : FAN_BY_ID[id as FanId]
}

/** Points needed to win: MCR 8 fan (flowers excluded), Hong Kong 3 faan (flowers included), unless house rules say otherwise. */
export function minimumFor(config: RuleConfig): number {
  return config.rules === 'hk' ? hk(config).minFaan : mcr(config).minFan
}

/** Most a hand can score: the Hong Kong limit; MCR has none. */
export function maximumFor(config: RuleConfig): number | null {
  return config.rules === 'hk' ? hk(config).maxFaan : null
}

/** Score of a complete hand under `config`, or null when the tiles are not a winning shape. */
export function scoreFor(config: RuleConfig, ctx: WinContext): HandScore | null {
  return config.rules === 'hk' ? scoreHandHK(ctx, hk(config)) : scoreHand(ctx)
}

/** The score is enough to declare a win under `config`. */
export function meetsMinimumFor(config: RuleConfig, score: HandScore): boolean {
  return config.rules === 'hk' ? meetsMinimumHK(score, hk(config)) : meetsMinimum(score, mcr(config).minFan)
}

/** Point transfers for a win under `config`; always sums to zero. */
export function settleFor(config: RuleConfig, result: { winner: Seat; from: Seat | null }, score: HandScore): number[] {
  return config.rules === 'hk' ? settleHK(result, score, hk(config)) : settle(result, score)
}

/**
 * What each loser pays for a win scoring `total` under `config`:
 * the discarder, each other loser on a discard win, and each loser on a self-draw.
 * `base` is the Hong Kong base points (b) or the MCR base (8).
 */
export type Payment = { total: number; base: number; discarder: number; other: number; selfDraw: number }

export function paymentFor(config: RuleConfig, total: number): Payment {
  if (config.rules === 'hk') return { total, base: hkBasePoints(total, hk(config)), ...hkPayments(total, hk(config)) }
  return { total, base: MIN_FAN, discarder: MIN_FAN + total, other: MIN_FAN, selfDraw: MIN_FAN + total }
}

/**
 * Sample payouts for a preview table: every faan from the minimum to the limit (Hong Kong),
 * or a spread of typical totals from the minimum (MCR).
 */
export function paymentTable(config: RuleConfig): Payment[] {
  if (config.rules === 'hk') {
    const { minFaan, maxFaan } = hk(config)
    return Array.from({ length: maxFaan - minFaan + 1 }, (_, i) => paymentFor(config, minFaan + i))
  }
  const min = mcr(config).minFan
  const totals = [...new Set([min, 8, 12, 16, 24, 32, 48, 64, 88])].filter((v) => v >= min).sort((a, b) => a - b)
  return totals.map((v) => paymentFor(config, v))
}
