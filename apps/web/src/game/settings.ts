import { ref, watch } from 'vue'
import { isRuleSet, type RuleSet } from '@mahjong/engine'
import type { Difficulty } from '../bots/protocol'

const STORAGE_KEY = 'mahjong.settings.v1'
/** Older builds kept difficulty and rules only inside the saved match. */
const LEGACY_MATCH_KEY = 'mahjong.match.v2'

export const CLAIM_TIMER_OPTIONS = [0, 5, 10, 20] as const
export type ClaimSeconds = (typeof CLAIM_TIMER_OPTIONS)[number]
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']

type Settings = { claimSeconds: ClaimSeconds; sound: boolean; difficulty: Difficulty; rules: RuleSet }
const DEFAULTS: Settings = { claimSeconds: 10, sound: true, difficulty: 'medium', rules: 'mcr' }

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
    difficulty: DIFFICULTIES.includes(difficulty as Difficulty) ? (difficulty as Difficulty) : DEFAULTS.difficulty,
    rules: isRuleSet(rules) ? rules : DEFAULTS.rules,
  }
}

const initial = load()
/** App-wide player preferences, persisted per browser. */
const claimSeconds = ref<ClaimSeconds>(initial.claimSeconds)
const sound = ref(initial.sound)
const difficulty = ref<Difficulty>(initial.difficulty)
/** Rule set for new matches; a match in progress keeps the rules it started with. */
const rules = ref<RuleSet>(initial.rules)

watch(
  [claimSeconds, sound, difficulty, rules],
  () => {
    const settings: Settings = { claimSeconds: claimSeconds.value, sound: sound.value, difficulty: difficulty.value, rules: rules.value }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Not persisted; settings still apply for this visit.
    }
  },
  { immediate: true },
)

export function useSettings() {
  return { claimSeconds, sound, difficulty, rules }
}
