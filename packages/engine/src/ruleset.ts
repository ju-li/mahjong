import { FAN_BY_ID, FANS, type FanId } from './fans'
import { hkFansFor, HK_FAN_BY_ID, hkBasePoints, hkPayments, meetsMinimumHK, scoreHandHK, settleHK, type HkFanId } from './hk'
import { houseOf, type RuleConfig } from './house'
import { meetsMinimum, MIN_FAN, scoreHand, type WinContext } from './scoring'
import { settle } from './settle'
import { meetsMinimumSG, scoreHandSG, settleSG, SG_FAN_BY_ID, sgBasePoints, sgFansFor, sgPayments, type SgFanId } from './sg'
import type { HandScore, Seat } from './state'

/** Playable rule sets: Mahjong Competition Rules (Chinese Official), Hong Kong and Singapore. */
export type RuleSet = 'mcr' | 'hk' | 'sg'
export const RULE_SETS: readonly RuleSet[] = ['mcr', 'hk', 'sg']
export const DEFAULT_RULES: RuleSet = 'mcr'

export function isRuleSet(value: unknown): value is RuleSet {
  return RULE_SETS.includes(value as RuleSet)
}

/** A scoring element of any rule set, as the fan list shows it. */
export type RuleFanDef = {
  id: string
  name: string
  chinese: string
  points: number
  excludes: readonly string[]
  description: { en: string; zh: string }
}

const hk = (config: RuleConfig) => houseOf({ rules: 'hk', house: config.house })
const sg = (config: RuleConfig) => houseOf({ rules: 'sg', house: config.house })
const mcr = (config: RuleConfig) => houseOf({ rules: 'mcr', house: config.house })

/** Every fan (MCR), faan (Hong Kong) or tai (Singapore) element a table with `config` can score, with its value there. */
export function fansFor(config: RuleConfig): readonly RuleFanDef[] {
  switch (config.rules) {
    case 'mcr':
      return mcr(config).flowers ? FANS : FANS.filter((f) => f.id !== 'flowerTiles')
    case 'hk':
      return hkFansFor(hk(config))
    case 'sg':
      return sgFansFor(sg(config))
  }
}

/** Look up a scoring element by id in any rule set. Hong Kong ids start with `hk.`, Singapore ids with `sg.`. */
export function fanDef(id: string): RuleFanDef | undefined {
  if (id.startsWith('hk.')) return HK_FAN_BY_ID[id as HkFanId]
  if (id.startsWith('sg.')) return SG_FAN_BY_ID[id as SgFanId]
  return FAN_BY_ID[id as FanId]
}

/**
 * Points needed to win: MCR 8 fan (flowers excluded), Hong Kong 3 faan (flowers included),
 * Singapore 1 tai (bonus tiles included), unless house rules say otherwise.
 */
export function minimumFor(config: RuleConfig): number {
  switch (config.rules) {
    case 'mcr':
      return mcr(config).minFan
    case 'hk':
      return hk(config).minFaan
    case 'sg':
      return sg(config).minTai
  }
}

/** Most a hand can score: the Hong Kong or Singapore limit; MCR has none. */
export function maximumFor(config: RuleConfig): number | null {
  switch (config.rules) {
    case 'mcr':
      return null
    case 'hk':
      return hk(config).maxFaan
    case 'sg':
      return sg(config).maxTai
  }
}

/** Score of a complete hand under `config`, or null when the tiles are not a winning shape. */
export function scoreFor(config: RuleConfig, ctx: WinContext): HandScore | null {
  switch (config.rules) {
    case 'mcr':
      return scoreHand(ctx)
    case 'hk':
      return scoreHandHK(ctx, hk(config))
    case 'sg':
      return scoreHandSG(ctx, sg(config))
  }
}

/** The score is enough to declare a win under `config`. */
export function meetsMinimumFor(config: RuleConfig, score: HandScore): boolean {
  switch (config.rules) {
    case 'mcr':
      return meetsMinimum(score, mcr(config).minFan)
    case 'hk':
      return meetsMinimumHK(score, hk(config))
    case 'sg':
      return meetsMinimumSG(score, sg(config))
  }
}

/** Point transfers for a win under `config`; always sums to zero. Singapore bites are separate (`HandResult.bonus`). */
export function settleFor(config: RuleConfig, result: { winner: Seat; from: Seat | null }, score: HandScore): number[] {
  switch (config.rules) {
    case 'mcr':
      return settle(result, score)
    case 'hk':
      return settleHK(result, score, hk(config))
    case 'sg':
      return settleSG(result, score, sg(config))
  }
}

/**
 * What each loser pays for a win scoring `total` under `config`:
 * the discarder, each other loser on a discard win, and each loser on a self-draw.
 * `base` is the Hong Kong or Singapore base points (b) or the MCR base (8).
 */
export type Payment = { total: number; base: number; discarder: number; other: number; selfDraw: number }

export function paymentFor(config: RuleConfig, total: number): Payment {
  switch (config.rules) {
    case 'mcr':
      return { total, base: MIN_FAN, discarder: MIN_FAN + total, other: MIN_FAN, selfDraw: MIN_FAN + total }
    case 'hk':
      return { total, base: hkBasePoints(total, hk(config)), ...hkPayments(total, hk(config)) }
    case 'sg':
      return { total, base: sgBasePoints(total, sg(config)), ...sgPayments(total, sg(config)) }
  }
}

/**
 * Sample payouts for a preview table: every faan or tai from the minimum to the limit (Hong Kong, Singapore),
 * or a spread of typical totals from the minimum (MCR).
 */
export function paymentTable(config: RuleConfig): Payment[] {
  switch (config.rules) {
    case 'mcr': {
      const min = mcr(config).minFan
      const totals = [...new Set([min, 8, 12, 16, 24, 32, 48, 64, 88])].filter((v) => v >= min).sort((a, b) => a - b)
      return totals.map((v) => paymentFor(config, v))
    }
    case 'hk':
    case 'sg': {
      const min = minimumFor(config)
      const max = maximumFor(config)!
      return Array.from({ length: max - min + 1 }, (_, i) => paymentFor(config, min + i))
    }
  }
}
