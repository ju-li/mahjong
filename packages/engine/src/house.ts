import type { RuleSet } from './ruleset'

/**
 * House rules: the table-by-table tweaks families play on top of a rule set.
 * Every option is a closed list, so validation, bots, tests and the UI stay finite.
 * Labels and explanations live in the web dictionaries (engine holds no UI strings besides fan names).
 */

/** Hong Kong options. The defaults are the standard table the engine scored before house rules existed. */
export type HkHouseRules = {
  /** Faan needed to win, flowers included. 0 allows a chicken hand (鸡胡). */
  minFaan: 0 | 1 | 3
  /** Limit (满贯): no hand scores more; limit hands score exactly this. */
  maxFaan: 8 | 10 | 13
  /** Faan → base points: 'half' doubles to 4 faan then every 2 faan (半辣上); 'full' doubles every faan (辣辣上). */
  curve: 'half' | 'full'
  /** Discard win: 'half' = discarder pays 2b, others b (半铳); 'full' = discarder pays all 4b (全铳). */
  payment: 'half' | 'full'
  /** Faan for declared kongs: none, 1 each, or 1 per melded and 2 per concealed kong. */
  kongFaan: 'none' | 'each1' | 'melded1concealed2'
  /** Flowers and seasons in the wall (and their faan). */
  flowers: boolean
}

/** MCR stays the competition standard apart from these casual options. */
export type McrHouseRules = {
  /** Fan needed to win, flowers excluded. */
  minFan: 8 | 4 | 0
  /** Flowers and seasons in the wall. */
  flowers: boolean
}

export type HouseRulesFor = { mcr: McrHouseRules; hk: HkHouseRules }
export type HouseRules = McrHouseRules | HkHouseRules

/** A rule set plus its house rules. `house` missing (older saves) means standard. */
export type RuleConfig = { rules: RuleSet; house?: HouseRules }

export const STANDARD_HOUSE: { readonly [R in RuleSet]: Readonly<HouseRulesFor[R]> } = {
  mcr: { minFan: 8, flowers: true },
  hk: { minFaan: 3, maxFaan: 13, curve: 'half', payment: 'half', kongFaan: 'none', flowers: true },
}

/**
 * The options of each rule set, in the order the questionnaire asks them.
 * The first value of each list is not necessarily the standard; see `STANDARD_HOUSE`.
 */
export const HOUSE_OPTIONS: { readonly [R in RuleSet]: { readonly [K in keyof HouseRulesFor[R]]: readonly HouseRulesFor[R][K][] } } = {
  mcr: {
    minFan: [8, 4, 0],
    flowers: [true, false],
  },
  hk: {
    kongFaan: ['none', 'each1', 'melded1concealed2'],
    minFaan: [3, 1, 0],
    maxFaan: [13, 10, 8],
    payment: ['half', 'full'],
    curve: ['half', 'full'],
    flowers: [true, false],
  },
}

/** Option keys of a rule set, in questionnaire order. */
export function houseKeys<R extends RuleSet>(rules: R): (keyof HouseRulesFor[R] & string)[] {
  return Object.keys(HOUSE_OPTIONS[rules]) as (keyof HouseRulesFor[R] & string)[]
}

/** The standard house rules of a rule set, as a fresh object. */
export function standardHouse<R extends RuleSet>(rules: R): HouseRulesFor[R] {
  return { ...STANDARD_HOUSE[rules] } as HouseRulesFor[R]
}

/**
 * The only validator for house rules from outside the engine (storage, network, database).
 * Unknown keys are dropped; missing or out-of-range values fall back to the standard.
 */
export function normalizeHouseRules<R extends RuleSet>(rules: R, input: unknown): HouseRulesFor[R] {
  const out = standardHouse(rules) as Record<string, unknown>
  const raw = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const options = HOUSE_OPTIONS[rules] as Record<string, readonly unknown[]>
  for (const key of Object.keys(options)) {
    if (options[key]!.includes(raw[key])) out[key] = raw[key]
  }
  return out as HouseRulesFor[R]
}

/** House rules of a config with defaults filled in; trusts engine-made values. */
export function houseOf<R extends RuleSet>(config: { rules: R; house?: HouseRules }): HouseRulesFor[R] {
  return config.house ? (config.house as HouseRulesFor[R]) : standardHouse(config.rules)
}

export type HouseDiff = { key: string; value: unknown; standard: unknown }

/** Options that differ from the standard, in questionnaire order. Empty = standard rules. */
export function houseDiff(config: RuleConfig): HouseDiff[] {
  const house = normalizeHouseRules(config.rules, config.house) as Record<string, unknown>
  const standard = STANDARD_HOUSE[config.rules] as Record<string, unknown>
  return houseKeys(config.rules)
    .filter((key) => house[key] !== standard[key])
    .map((key) => ({ key, value: house[key], standard: standard[key] }))
}

export function isStandard(config: RuleConfig): boolean {
  return houseDiff(config).length === 0
}

/** Whether the wall holds flowers and seasons. */
export function hasFlowers(config: RuleConfig): boolean {
  return houseOf(config).flowers
}
