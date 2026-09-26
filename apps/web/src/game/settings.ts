import { ref, watch } from 'vue'
import { isRuleSet, type RuleSet } from '@mahjong/engine'
import type { Difficulty } from '@mahjong/bots'

const STORAGE_KEY = 'mahjong.settings.v1'
/** Older builds kept difficulty and rules only inside the saved match. */
const LEGACY_MATCH_KEY = 'mahjong.match.v2'

export const CLAIM_TIMER_OPTIONS = [0, 5, 10, 20] as const
export type ClaimSeconds = (typeof CLAIM_TIMER_OPTIONS)[number]
/** Rule sets in the pickers; only those the engine implements can be chosen. */
export const RULE_OPTIONS = [
  { id: 'mcr', playable: true },
  { id: 'hk', playable: true },
  { id: 'riichi', playable: false },
  { id: 'taiwan', playable: false },
] as const
const DIFFICULTIES: readonly Difficulty[] = ['beginner', 'easy', 'medium', 'hard']

/** Scales every text size in the app (see the type scale in style.css). */
export const TEXT_SIZE_OPTIONS = ['normal', 'large', 'larger'] as const
export type TextSize = (typeof TEXT_SIZE_OPTIONS)[number]

type Settings = { claimSeconds: ClaimSeconds; sound: boolean; voice: boolean; voiceChat: boolean; difficulty: Difficulty; rules: RuleSet; textSize: TextSize }
const DEFAULTS: Settings = { claimSeconds: 10, sound: true, voice: true, voiceChat: true, difficulty: 'medium', rules: 'mcr', textSize: 'normal' }

function read(key: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function load(): Settings {
  const raw = read(STORAGE_KEY)
  const legacy = read(LEGACY_MATCH_KEY)
  const legacyRules = (legacy?.match as { rules?: unknown } | undefined)?.rules
  const difficulty = raw?.difficulty ?? legacy?.difficulty
  const rules = raw?.rules ?? legacyRules
  return {
    claimSeconds: CLAIM_TIMER_OPTIONS.includes(raw?.claimSeconds as ClaimSeconds) ? (raw!.claimSeconds as ClaimSeconds) : DEFAULTS.claimSeconds,
    sound: typeof raw?.sound === 'boolean' ? raw.sound : DEFAULTS.sound,
    voice: typeof raw?.voice === 'boolean' ? raw.voice : DEFAULTS.voice,
    voiceChat: typeof raw?.voiceChat === 'boolean' ? raw.voiceChat : DEFAULTS.voiceChat,
    difficulty: DIFFICULTIES.includes(difficulty as Difficulty) ? (difficulty as Difficulty) : DEFAULTS.difficulty,
    rules: isRuleSet(rules) ? rules : DEFAULTS.rules,
    textSize: TEXT_SIZE_OPTIONS.includes(raw?.textSize as TextSize) ? (raw!.textSize as TextSize) : DEFAULTS.textSize,
  }
}

const initial = load()
/** True until a first-time player finishes onboarding; nothing is saved before then. */
const needsOnboarding = ref(read(STORAGE_KEY) === null)
/** App-wide player preferences, persisted per browser. */
const claimSeconds = ref<ClaimSeconds>(initial.claimSeconds)
const sound = ref(initial.sound)
/** Every player's moves are called out (吃, 碰, 北风…) with speech synthesis. */
const voice = ref(initial.voice)
/** Other players' push-to-talk memos play at online tables. */
const voiceChat = ref(initial.voiceChat)
const difficulty = ref<Difficulty>(initial.difficulty)
/** Rule set for new matches; a match in progress keeps the rules it started with. */
const rules = ref<RuleSet>(initial.rules)
const textSize = ref<TextSize>(initial.textSize)

watch(
  [claimSeconds, sound, voice, voiceChat, difficulty, rules, textSize, needsOnboarding],
  () => {
    if (needsOnboarding.value) return
    const settings: Settings = {
      claimSeconds: claimSeconds.value,
      sound: sound.value,
      voice: voice.value,
      voiceChat: voiceChat.value,
      difficulty: difficulty.value,
      rules: rules.value,
      textSize: textSize.value,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Not persisted; settings still apply for this visit.
    }
  },
  { immediate: true },
)

watch(
  textSize,
  (size) => {
    if (typeof document !== 'undefined') document.documentElement.dataset.textSize = size
  },
  { immediate: true },
)

export function useSettings() {
  const finishOnboarding = () => {
    needsOnboarding.value = false
  }
  return { claimSeconds, sound, voice, voiceChat, difficulty, rules, textSize, needsOnboarding, finishOnboarding }
}
