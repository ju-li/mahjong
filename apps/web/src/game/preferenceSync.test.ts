import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { STANDARD_HOUSE } from '@mahjong/engine'
import type { PreferencesSync } from '@mahjong/protocol'

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  })
  return data
}

/** Fresh modules each time: settings and the sync state are read once, at import. */
async function load() {
  vi.resetModules()
  const sync = await import('./preferenceSync')
  const { useSettings } = await import('./settings')
  const { useI18n } = await import('../i18n/useI18n')
  const sent: PreferencesSync[] = []
  sync.connectPreferences((p) => sent.push(p))
  return { sync, settings: useSettings(), locale: useI18n().locale, sent }
}

const accountCopy = (updatedAt: number): PreferencesSync => ({
  settings: { rules: 'hk', house: { hk: { kongFaan: 'each1' } }, difficulty: 'hard', locale: 'zh-Hans' },
  updatedAt,
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('preference sync', () => {
  it('restores an account\'s preferences on a device that is still onboarding', async () => {
    stubStorage({ 'mahjong.locale': 'en' })
    const { sync, settings, locale, sent } = await load()
    expect(settings.needsOnboarding.value).toBe(true)
    sync.receivePreferences(accountCopy(1000))
    expect(settings.rules.value).toBe('hk')
    expect(settings.house.value.hk).toEqual({ ...STANDARD_HOUSE.hk, kongFaan: 'each1' })
    expect(settings.difficulty.value).toBe('hard')
    expect(locale.value).toBe('zh-Hans')
    expect(sync.restoredFromAccount.value).toBe(1)
    expect(sent).toEqual([])
  })

  it('keeps going through onboarding when the account has nothing saved', async () => {
    stubStorage()
    const { sync, sent } = await load()
    sync.receivePreferences({ settings: null, updatedAt: null })
    expect(sync.restoredFromAccount.value).toBe(0)
    expect(sent).toEqual([])
  })

  it('sends this device\'s copy when it is newer, and takes the account\'s when that is', async () => {
    vi.useFakeTimers()
    stubStorage({ 'mahjong.settings.v2': JSON.stringify({ rules: 'mcr' }), 'mahjong.settings.changedAt': '5000' })
    const { sync, settings, sent } = await load()
    sync.receivePreferences(accountCopy(1000))
    expect(settings.rules.value).toBe('mcr')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ updatedAt: 5000, settings: { rules: 'mcr' } })

    sync.receivePreferences(accountCopy(9000))
    expect(settings.rules.value).toBe('hk')
    await nextTick()
    vi.advanceTimersByTime(2000)
    // Taking the account's copy is not a change to send back.
    expect(sent).toHaveLength(1)

    settings.difficulty.value = 'beginner'
    await nextTick()
    vi.advanceTimersByTime(2000)
    expect(sent).toHaveLength(2)
    expect(sent[1]!.settings).toMatchObject({ rules: 'hk', difficulty: 'beginner' })
    expect(sent[1]!.updatedAt).toBeGreaterThan(9000)
  })
})
