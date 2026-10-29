import type { RuleSet } from '@mahjong/engine'

/** Suffix of dictionary keys that differ by rule set: `fans.points` (MCR), `fans.pointsHk`, `fans.pointsSg`. */
export const RULE_SUFFIX = { mcr: '', hk: 'Hk', sg: 'Sg' } as const satisfies Record<RuleSet, string>

/** The rule set's variant of a dictionary key; the type lists every variant, so each must exist. */
export const ruleKey = <B extends string>(base: B, rules: RuleSet) => `${base}${RULE_SUFFIX[rules]}` as `${B}${(typeof RULE_SUFFIX)[RuleSet]}`
