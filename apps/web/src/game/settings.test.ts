import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  })
  return data
}

/** Fresh module each time: settings are read once, at import. */
async function importSettings() {
  vi.resetModules()
  return import('./settings')
}

afterEach(() => vi.unstubAllGlobals())

describe('settings', () => {
  it('falls back to defaults without storage', async () => {
    vi.stubGlobal('localStorage', undefined)
    const { load } = await importSettings()
    expect(load()).toEqual({ claimSeconds: 10, sound: true, voice: true, difficulty: 'medium', rules: 'mcr' })
  })

  it('asks a first-time player to onboard and saves nothing until they finish', async () => {
    const data = stubStorage()
    const { useSettings } = await importSettings()
    const s = useSettings()
    expect(s.needsOnboarding.value).toBe(true)
    s.difficulty.value = 'easy'
    await nextTick()
    expect(data.has('mahjong.settings.v1')).toBe(false)

    s.finishOnboarding()
    await nextTick()
    expect(JSON.parse(data.get('mahjong.settings.v1')!)).toMatchObject({ difficulty: 'easy' })
    expect((await importSettings()).useSettings().needsOnboarding.value).toBe(false)
  })

  it('writes every setting to localStorage and reads it back', async () => {
    const data = stubStorage({ 'mahjong.settings.v1': '{}' })
    const { useSettings } = await importSettings()
    const s = useSettings()
    expect(s.needsOnboarding.value).toBe(false)
    s.claimSeconds.value = 5
    s.sound.value = false
    s.difficulty.value = 'hard'
    s.rules.value = 'hk'
    await nextTick()
    expect(JSON.parse(data.get('mahjong.settings.v1')!)).toEqual({ claimSeconds: 5, sound: false, voice: true, difficulty: 'hard', rules: 'hk' })

    const reloaded = await importSettings()
    expect(reloaded.load()).toEqual({ claimSeconds: 5, sound: false, voice: true, difficulty: 'hard', rules: 'hk' })
  })

  it('takes difficulty and rules from a match saved by an older version', async () => {
    stubStorage({
      'mahjong.settings.v1': JSON.stringify({ claimSeconds: 20, sound: true }),
      'mahjong.match.v2': JSON.stringify({ match: { rules: 'hk' }, difficulty: 'easy' }),
    })
    const { load } = await importSettings()
    expect(load()).toEqual({ claimSeconds: 20, sound: true, voice: true, difficulty: 'easy', rules: 'hk' })
  })

  it('ignores invalid stored values', async () => {
    stubStorage({ 'mahjong.settings.v1': JSON.stringify({ claimSeconds: 7, sound: 'yes', difficulty: 'insane', rules: 'riichi-x' }) })
    const { load } = await importSettings()
    expect(load()).toEqual({ claimSeconds: 10, sound: true, voice: true, difficulty: 'medium', rules: 'mcr' })
  })
})
