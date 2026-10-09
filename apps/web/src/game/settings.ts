import { computed, ref, watch } from 'vue'
import { isRuleSet, normalizeHouseRules, type HouseRulesFor, type RuleConfig, type RuleSet } from '@mahjong/engine'
import type { Difficulty } from '@mahjong/bots'
import { DEFAULT_TERMS, normalizeTerms, type Terms } from '../i18n/terms'

/**
 * v2 came with house rules and terminology. Settings from v1 are not carried over on purpose:
 * every player goes through the new onboarding once (their name, face and language are kept).
 */
const STORAGE_KEY = 'mahjong.settings.v2'
const OLD_KEYS = ['mahjong.settings.v1']

export const CLAIM_TIMER_OPTIONS = [0, 20, 40, 60, 120] as const
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

/** House rules the player plays by default, kept per rule set so switching rule sets loses nothing. */
export type HouseByRules = HouseRulesFor

export type Settings = {
  claimSeconds: ClaimSeconds
  sound: boolean
  voice: boolean
  voiceChat: boolean
  difficulty: Difficulty
  rules: RuleSet
  house: HouseByRules
  textSize: TextSize
  terms: Terms
}

export function standardHouseByRules(): HouseByRules {
  return { mcr: normalizeHouseRules('mcr', undefined), hk: normalizeHouseRules('hk', undefined) }
}

/** New players start gently: easy bots, no claim timer, sound on. */
export const DEFAULTS: Settings = {
  claimSeconds: 0,
  sound: true,
  voice: true,
  voiceChat: true,
  difficulty: 'easy',
  rules: 'mcr',
  house: standardHouseByRules(),
  textSize: 'normal',
  terms: DEFAULT_TERMS,
}

function normalizeHouseByRules(input: unknown): HouseByRules {
  const raw = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return { mcr: normalizeHouseRules('mcr', raw.mcr), hk: normalizeHouseRules('hk', raw.hk) }
}

function read(key: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Valid settings from anything stored or synced; each bad or missing field falls back to its default. */
export function normalizeSettings(raw: Record<string, unknown> | null): Settings {
  const difficulty = raw?.difficulty
  const rules = raw?.rules
  return {
    claimSeconds: CLAIM_TIMER_OPTIONS.includes(raw?.claimSeconds as ClaimSeconds) ? (raw!.claimSeconds as ClaimSeconds) : DEFAULTS.claimSeconds,
    sound: typeof raw?.sound === 'boolean' ? raw.sound : DEFAULTS.sound,
    voice: typeof raw?.voice === 'boolean' ? raw.voice : DEFAULTS.voice,
    voiceChat: typeof raw?.voiceChat === 'boolean' ? raw.voiceChat : DEFAULTS.voiceChat,
    difficulty: DIFFICULTIES.includes(difficulty as Difficulty) ? (difficulty as Difficulty) : DEFAULTS.difficulty,
    rules: isRuleSet(rules) ? rules : DEFAULTS.rules,
    house: normalizeHouseByRules(raw?.house),
    textSize: TEXT_SIZE_OPTIONS.includes(raw?.textSize as TextSize) ? (raw!.textSize as TextSize) : DEFAULTS.textSize,
    terms: normalizeTerms(raw?.terms),
  }
}

export function load(): Settings {
  return normalizeSettings(read(STORAGE_KEY))
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
/** House rules for new matches and the tables this player hosts, per rule set. */
const house = ref<HouseByRules>(initial.house)
/** The preferred rule set with its house rules. */
const ruleConfig = computed<RuleConfig>(() => ({ rules: rules.value, house: house.value[rules.value] }))
const textSize = ref<TextSize>(initial.textSize)
/** Chinese words the player prefers (和 or 胡, 点和 or 点炮…); display only. */
const terms = ref<Terms>(initial.terms)

/** Every setting as one plain object. */
function current(): Settings {
  return {
    claimSeconds: claimSeconds.value,
    sound: sound.value,
    voice: voice.value,
    voiceChat: voiceChat.value,
    difficulty: difficulty.value,
    rules: rules.value,
    house: house.value,
    textSize: textSize.value,
    terms: terms.value,
  }
}

watch(
  [claimSeconds, sound, voice, voiceChat, difficulty, rules, house, textSize, terms, needsOnboarding],
  () => {
    if (needsOnboarding.value) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current()))
      for (const key of OLD_KEYS) localStorage.removeItem(key)
    } catch {
      // Not persisted; settings still apply for this visit.
    }
  },
  { immediate: true, deep: true },
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
  /** Apply a whole settings object at once (synced from the account). */
  const apply = (next: Settings) => {
    claimSeconds.value = next.claimSeconds
    sound.value = next.sound
    voice.value = next.voice
    voiceChat.value = next.voiceChat
    difficulty.value = next.difficulty
    rules.value = next.rules
    house.value = next.house
    textSize.value = next.textSize
    terms.value = next.terms
  }
  return { claimSeconds, sound, voice, voiceChat, difficulty, rules, house, ruleConfig, textSize, terms, needsOnboarding, finishOnboarding, apply, current }
}
