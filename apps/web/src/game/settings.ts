import { ref, watch } from 'vue'

const STORAGE_KEY = 'mahjong.settings.v1'

export const CLAIM_TIMER_OPTIONS = [0, 5, 10, 20] as const
export type ClaimSeconds = (typeof CLAIM_TIMER_OPTIONS)[number]

/** Scales every text size in the app (see the type scale in style.css). */
export const TEXT_SIZE_OPTIONS = ['normal', 'large', 'larger'] as const
export type TextSize = (typeof TEXT_SIZE_OPTIONS)[number]

type Settings = { claimSeconds: ClaimSeconds; sound: boolean; textSize: TextSize }
const DEFAULTS: Settings = { claimSeconds: 10, sound: true, textSize: 'normal' }

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Settings> | null
    return {
      claimSeconds: CLAIM_TIMER_OPTIONS.includes(raw?.claimSeconds as ClaimSeconds) ? (raw!.claimSeconds as ClaimSeconds) : DEFAULTS.claimSeconds,
      sound: typeof raw?.sound === 'boolean' ? raw.sound : DEFAULTS.sound,
      textSize: TEXT_SIZE_OPTIONS.includes(raw?.textSize as TextSize) ? (raw!.textSize as TextSize) : DEFAULTS.textSize,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const initial = load()
/** App-wide player preferences, persisted per browser. */
const claimSeconds = ref<ClaimSeconds>(initial.claimSeconds)
const sound = ref(initial.sound)
const textSize = ref<TextSize>(initial.textSize)

watch([claimSeconds, sound, textSize], () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ claimSeconds: claimSeconds.value, sound: sound.value, textSize: textSize.value }))
  } catch {
    // Not persisted; settings still apply for this visit.
  }
})

watch(
  textSize,
  (size) => {
    if (typeof document !== 'undefined') document.documentElement.dataset.textSize = size
  },
  { immediate: true },
)

export function useSettings() {
  return { claimSeconds, sound, textSize }
}
