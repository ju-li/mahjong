import { ref, watch } from 'vue'

const STORAGE_KEY = 'mahjong.settings.v1'

export const CLAIM_TIMER_OPTIONS = [0, 5, 10, 20] as const
export type ClaimSeconds = (typeof CLAIM_TIMER_OPTIONS)[number]

type Settings = { claimSeconds: ClaimSeconds; sound: boolean; voice: boolean }
const DEFAULTS: Settings = { claimSeconds: 10, sound: true, voice: true }

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Settings> | null
    return {
      claimSeconds: CLAIM_TIMER_OPTIONS.includes(raw?.claimSeconds as ClaimSeconds) ? (raw!.claimSeconds as ClaimSeconds) : DEFAULTS.claimSeconds,
      sound: typeof raw?.sound === 'boolean' ? raw.sound : DEFAULTS.sound,
      voice: typeof raw?.voice === 'boolean' ? raw.voice : DEFAULTS.voice,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const initial = load()
/** App-wide player preferences, persisted per browser. */
const claimSeconds = ref<ClaimSeconds>(initial.claimSeconds)
const sound = ref(initial.sound)
/** Bots call out their moves (吃, 碰, 北风…) with speech synthesis. */
const voice = ref(initial.voice)

watch([claimSeconds, sound, voice], () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ claimSeconds: claimSeconds.value, sound: sound.value, voice: voice.value }))
  } catch {
    // Not persisted; settings still apply for this visit.
  }
})

export function useSettings() {
  return { claimSeconds, sound, voice }
}
