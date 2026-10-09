import { HOUSE_OPTIONS, houseKeys, type RuleSet } from '@mahjong/engine'
import type { MessageKey } from './messages'

/** Dictionary keys for the house-rule questions; every option of `HOUSE_OPTIONS` has a label and a hint. */
export const houseTitle = (rules: RuleSet, key: string) => `house.${rules}.${key}.title` as MessageKey
export const houseShort = (rules: RuleSet, key: string) => `house.${rules}.${key}.short` as MessageKey
export const houseLabel = (rules: RuleSet, key: string, value: unknown) => `house.${rules}.${key}.${String(value)}` as MessageKey
export const houseHint = (rules: RuleSet, key: string, value: unknown) => `house.${rules}.${key}.${String(value)}.hint` as MessageKey

/** Every key the house-rule screens use, for the dictionary test. */
export function houseMessageKeys(): MessageKey[] {
  return (['mcr', 'hk'] as const).flatMap((rules) =>
    houseKeys(rules).flatMap((key) => [
      houseTitle(rules, key),
      houseShort(rules, key),
      ...(HOUSE_OPTIONS[rules] as Record<string, readonly unknown[]>)[key]!.flatMap((v) => [houseLabel(rules, key, v), houseHint(rules, key, v)]),
    ]),
  )
}

/** The options of one question, in order. */
export const houseValues = (rules: RuleSet, key: string): readonly unknown[] => (HOUSE_OPTIONS[rules] as Record<string, readonly unknown[]>)[key]!
