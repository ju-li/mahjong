import { describe, expect, it } from 'vitest'
import { FANS } from '@mahjong/engine'
import { en, MESSAGES, zhHans } from './messages'
import { translate } from './useI18n'

/** Source files that render text; any quoted English sentence in their templates would bypass i18n. */
const components = import.meta.glob('../**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('i18n (V29)', () => {
  it('en and zh-Hans have identical keys and no empty strings', () => {
    expect(Object.keys(zhHans).sort()).toEqual(Object.keys(en).sort())
    for (const dict of Object.values(MESSAGES)) for (const v of Object.values(dict)) expect(v.trim()).not.toBe('')
  })

  it('placeholders match between languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(vars(zhHans[key]), key).toEqual(vars(en[key]))
  })

  it('fills placeholders', () => {
    expect(translate('en', 'score.hand', { n: 3, total: 16 })).toBe('Hand 3 / 16')
    expect(translate('zh-Hans', 'score.hand', { n: 3, total: 16 })).toBe('第 3 / 16 盘')
  })

  it('every fan has names and descriptions in both languages', () => {
    for (const f of FANS) {
      expect(f.name.trim(), f.id).not.toBe('')
      expect(f.chinese.trim(), f.id).not.toBe('')
      expect(f.description.en.trim(), f.id).not.toBe('')
      expect(f.description.zh.trim(), f.id).not.toBe('')
    }
  })

  it('component templates contain no hard-coded English text', () => {
    const offenders: string[] = []
    for (const [path, src] of Object.entries(components)) {
      // Blank out quoted attribute values so `d > 0` in a binding is not read as a tag boundary.
      const template = src.slice(src.indexOf('<template>')).replace(/"[^"]*"/g, '""')
      // Text nodes between tags that contain an English word of 3+ letters.
      for (const m of template.matchAll(/>([^<{}]*[A-Za-z]{3,}[^<{}]*)</g)) offenders.push(`${path}: ${m[1]!.trim()}`)
    }
    expect(offenders).toEqual([])
  })
})
