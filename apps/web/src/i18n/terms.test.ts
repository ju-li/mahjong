import { describe, expect, it } from 'vitest'
import { FANS, HK_FANS } from '@mahjong/engine'
import { en, zhHans, type MessageKey } from './messages'
import { DEFAULT_TERMS, normalizeTerms, resolveTerms, TERM_IDS, TERM_OPTIONS, termTokens } from './terms'
import { translate } from './useI18n'

const engineTexts = [...FANS, ...HK_FANS].flatMap((f) => [f.chinese, f.description.zh])

describe('terminology', () => {
  it('every token in the dictionary and the engine names a known term', () => {
    for (const text of [...Object.values(zhHans), ...engineTexts]) {
      for (const id of termTokens(text)) expect(TERM_IDS, text).toContain(id)
    }
  })

  it('English never carries tokens', () => {
    for (const text of Object.values(en)) expect(termTokens(text)).toEqual([])
  })

  it('defaults reproduce the original wording', () => {
    expect(translate('zh-Hans', 'action.win')).toBe('和！')
    expect(translate('zh-Hans', 'result.howDiscard', { from: '小明' })).toBe('小明点和')
    expect(resolveTerms('碰碰{t:win}', DEFAULT_TERMS)).toBe('碰碰和')
  })

  it('applies the chosen words everywhere', () => {
    const terms = normalizeTerms({ win: '胡', discarder: '放铳', drawn: '流局', dots: '筒', bamboo: '索', pair: '眼' })
    expect(translate('zh-Hans', 'action.win', {}, terms)).toBe('胡！')
    expect(translate('zh-Hans', 'status.winSelf', { name: '小明' }, terms)).toBe('小明自摸胡牌。')
    expect(translate('zh-Hans', 'result.howYourDiscard', {}, terms)).toBe('你放铳')
    expect(translate('zh-Hans', 'result.banner.draw', {}, terms)).toBe('流局')
    expect(translate('zh-Hans', 'tile.dots', {}, terms)).toBe('筒')
    const keys = Object.keys(zhHans) as MessageKey[]
    for (const key of keys) expect(translate('zh-Hans', key, {}, terms)).not.toMatch(/\{t:/)
    for (const text of engineTexts) expect(resolveTerms(text, terms)).not.toMatch(/\{t:/)
  })

  it('normalizes stored choices', () => {
    expect(normalizeTerms(null)).toEqual(DEFAULT_TERMS)
    expect(normalizeTerms({ win: '糊', discarder: '点炮', extra: 1 })).toEqual({ ...DEFAULT_TERMS, discarder: '点炮' })
    for (const id of TERM_IDS) expect(DEFAULT_TERMS[id]).toBe(TERM_OPTIONS[id][0])
  })
})
