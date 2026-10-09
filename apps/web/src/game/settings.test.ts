import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { STANDARD_HOUSE } from '@mahjong/engine'
import { DEFAULT_TERMS } from '../i18n/terms'

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  })
  return data
}

/** Fresh module each time: settings are read once, at import. */
async function importSettings() {
  vi.resetModules()
  return import('./settings')
}

const STANDARD = { mcr: STANDARD_HOUSE.mcr, hk: STANDARD_HOUSE.hk }
const DEFAULTS = { claimSeconds: 0, sound: true, voice: true, voiceChat: true, difficulty: 'easy', rules: 'mcr', house: STANDARD, textSize: 'normal', terms: DEFAULT_TERMS }

afterEach(() => vi.unstubAllGlobals())

describe('settings', () => {
  it('falls back to gentle defaults without storage', async () => {
    vi.stubGlobal('localStorage', undefined)
    const { load } = await importSettings()
    expect(load()).toEqual(DEFAULTS)
  })

  it('asks a first-time player to onboard and saves nothing until they finish', async () => {
    const data = stubStorage()
    const { useSettings } = await importSettings()
    const s = useSettings()
    expect(s.needsOnboarding.value).toBe(true)
    s.difficulty.value = 'hard'
    await nextTick()
    expect(data.has('mahjong.settings.v2')).toBe(false)

    s.finishOnboarding()
    await nextTick()
    expect(JSON.parse(data.get('mahjong.settings.v2')!)).toMatchObject({ difficulty: 'hard' })
    expect((await importSettings()).useSettings().needsOnboarding.value).toBe(false)
  })

  it('sends players with older settings through onboarding again, then drops the old key', async () => {
    const data = stubStorage({
      'mahjong.settings.v1': JSON.stringify({ claimSeconds: 120, difficulty: 'hard', rules: 'hk' }),
      'mahjong.match.v2': JSON.stringify({ match: { rules: 'hk' }, difficulty: 'hard' }),
    })
    const { useSettings, load } = await importSettings()
    expect(useSettings().needsOnboarding.value).toBe(true)
    expect(load()).toEqual(DEFAULTS)
    useSettings().finishOnboarding()
    await nextTick()
    expect(data.has('mahjong.settings.v1')).toBe(false)
    expect(data.has('mahjong.settings.v2')).toBe(true)
  })

  it('writes every setting, house rules and terms included, and reads it back', async () => {
    const data = stubStorage({ 'mahjong.settings.v2': '{}' })
    const { useSettings } = await importSettings()
    const s = useSettings()
    expect(s.needsOnboarding.value).toBe(false)
    s.claimSeconds.value = 60
    s.sound.value = false
    s.voiceChat.value = false
    s.difficulty.value = 'hard'
    s.rules.value = 'hk'
    s.house.value = { ...s.house.value, hk: { ...STANDARD_HOUSE.hk, kongFaan: 'each1' } }
    s.textSize.value = 'larger'
    s.terms.value = { ...s.terms.value, win: '胡' }
    await nextTick()
    const expected = {
      claimSeconds: 60,
      sound: false,
      voice: true,
      voiceChat: false,
      difficulty: 'hard',
      rules: 'hk',
      house: { mcr: STANDARD_HOUSE.mcr, hk: { ...STANDARD_HOUSE.hk, kongFaan: 'each1' } },
      textSize: 'larger',
      terms: { ...DEFAULT_TERMS, win: '胡' },
    }
    expect(JSON.parse(data.get('mahjong.settings.v2')!)).toEqual(expected)
    expect(s.ruleConfig.value).toEqual({ rules: 'hk', house: expected.house.hk })

    const reloaded = await importSettings()
    expect(reloaded.load()).toEqual(expected)
  })

  it('accepts the beginner level', async () => {
    stubStorage({ 'mahjong.settings.v2': JSON.stringify({ difficulty: 'beginner' }) })
    const { load } = await importSettings()
    expect(load().difficulty).toBe('beginner')
  })

  it('ignores invalid stored values', async () => {
    stubStorage({
      'mahjong.settings.v2': JSON.stringify({ claimSeconds: 10, sound: 'yes', difficulty: 'insane', rules: 'riichi-x', textSize: 'huge', house: { hk: { maxFaan: 99 } }, terms: { win: 'x' } }),
    })
    const { load } = await importSettings()
    expect(load()).toEqual(DEFAULTS)
  })
})
