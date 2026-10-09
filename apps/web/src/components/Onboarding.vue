<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { MAX_NAME_LENGTH } from '@mahjong/protocol'
import { houseKeys, isStandard, standardHouse, STANDARD_HOUSE, type HouseRules } from '@mahjong/engine'
import type { Difficulty } from '@mahjong/bots'
import AvatarPicker from './AvatarPicker.vue'
import TermsPicker from './TermsPicker.vue'
import HouseQuestion from './house/HouseQuestion.vue'
import HouseSummary from './house/HouseSummary.vue'
import PayoutPreview from './house/PayoutPreview.vue'
import { avatarSvg } from '../game/avatar'
import { isMobile } from '../game/device'
import { useProfile } from '../game/profile'
import { CLAIM_TIMER_OPTIONS, RULE_OPTIONS, useSettings } from '../game/settings'
import { playSound } from '../game/sound'
import { useAccount } from '../game/useAccount'
import { houseTitle } from '../i18n/houseText'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'

/** What the player chose to do once set up. */
export type OnboardingChoice = 'solo' | 'host' | 'join' | 'signIn'

/**
 * First-run setup, full screen and not skippable: language, rule set, house rules (one question
 * per page), Chinese terminology, game settings, profile, then what to play. Every answer is
 * written straight into the settings and profile, which are only saved once the player finishes.
 * `invite` is the table code of an invite link the player arrived with.
 */
const props = defineProps<{ invite?: string | null }>()
const emit = defineEmits<{ done: [choice: OnboardingChoice] }>()

const { t, locale, isZh } = useI18n()
const { claimSeconds, sound, difficulty, rules, house, ruleConfig, terms } = useSettings()
const profile = useProfile()
const account = useAccount()

const LEVELS: Difficulty[] = ['beginner', 'easy', 'medium', 'hard']
/** Shown in their own language, whatever the current one. */
const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'zh-Hans', label: '中文' },
] as const

/** Whether the player wants to answer the house-rule questions. */
const customizing = ref(!isStandard(ruleConfig.value))
const questions = computed(() => houseKeys(rules.value))

type Step = 'language' | 'mobile' | 'rules' | 'customize' | `q:${string}` | 'summary' | 'terms' | 'defaults' | 'profile' | 'start'
const steps = computed<Step[]>(() => [
  'language',
  // The "not optimized for mobile" notice comes right after the language, so it reads in the chosen one.
  ...(isMobile() ? (['mobile'] as const) : []),
  'rules',
  'customize',
  ...(customizing.value ? [...questions.value.map((k): Step => `q:${k}`), 'summary' as const] : []),
  // Terminology choices are Chinese words.
  ...(isZh.value ? (['terms'] as const) : []),
  'defaults',
  'profile',
  'start',
])

const index = ref(0)
const step = computed(() => steps.value[Math.min(index.value, steps.value.length - 1)]!)
const question = computed(() => (step.value.startsWith('q:') ? step.value.slice(2) : null))
const questionNumber = computed(() => (question.value ? questions.value.indexOf(question.value) + 1 : 0))
const body = ref<HTMLElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)

const goTo = (s: Step) => {
  const i = steps.value.indexOf(s)
  if (i >= 0) index.value = i
}

function next() {
  if (step.value === 'customize' && !customizing.value) house.value = { ...house.value, [rules.value]: standardHouse(rules.value) }
  if (index.value < steps.value.length - 1) index.value++
}
const back = () => index.value > 0 && index.value--

// ---- House rules ----
const currentHouse = computed(() => house.value[rules.value] as Record<string, unknown>)
function setOption(key: string, value: unknown) {
  house.value = { ...house.value, [rules.value]: { ...currentHouse.value, [key]: value } as HouseRules }
}
const standardOf = (key: string) => (STANDARD_HOUSE[rules.value] as Record<string, unknown>)[key]
/** Skip one question: keep the standard answer. */
function skipQuestion() {
  if (question.value) setOption(question.value, standardOf(question.value))
  next()
}
/** Keep this answer, take the standard for every later question, then show the summary. */
function standardForRest() {
  const from = questions.value.indexOf(question.value ?? '')
  for (const key of questions.value.slice(from + 1)) setOption(key, standardOf(key))
  goTo('summary')
}
/** Questions whose answer changes the payout table show it. */
const PAYOUT_QUESTIONS = new Set(['payment', 'curve', 'maxFaan', 'minFaan', 'minFan'])

// ---- Defaults ----
type Row = 'bots' | 'timer' | 'sound'
const openRow = ref<Row | null>(null)
const toggleRow = (row: Row) => (openRow.value = openRow.value === row ? null : row)
/** Sound on: play a chime so the player hears what they chose. */
function chooseSound(on: boolean) {
  sound.value = on
  if (on) playSound('yourTurn')
}

/** Each step starts with its selected option focused, so arrow keys and Enter work straight away. */
async function focusStep() {
  await nextTick()
  const checked = body.value?.querySelector<HTMLElement>('input:checked, input[type="text"], .onboard__choice')
  if (checked) checked.focus()
  else nextButton.value?.focus()
  body.value?.closest('.onboard-page')?.scrollTo({ top: 0 })
}
watch(index, focusStep)
onMounted(focusStep)

const titles: Record<Exclude<Step, `q:${string}`>, MessageKey> = {
  language: 'onboarding.language.title',
  mobile: 'onboarding.mobile.title',
  rules: 'onboarding.rules.title',
  customize: 'onboarding.customize.title',
  summary: 'onboarding.summary.title',
  terms: 'onboarding.terms.title',
  defaults: 'onboarding.defaults.title',
  profile: 'onboarding.profile.title',
  start: 'onboarding.start.title',
}
const intros: Record<Exclude<Step, `q:${string}`>, MessageKey> = {
  language: 'onboarding.required',
  mobile: 'onboarding.mobile.body',
  rules: 'onboarding.rules.body',
  customize: 'onboarding.customize.body',
  summary: 'onboarding.summary.body',
  terms: 'onboarding.terms.body',
  defaults: 'onboarding.defaults.body',
  profile: 'onboarding.profile.body',
  start: 'onboarding.start.body',
}
const title = computed(() => (question.value ? t(houseTitle(rules.value, question.value)) : t(titles[step.value as keyof typeof titles])))
const intro = computed(() =>
  question.value ? t('onboarding.question', { n: questionNumber.value, total: questions.value.length }) : t(intros[step.value as keyof typeof intros]),
)
</script>

<template>
  <section class="onboard-page" role="dialog" aria-modal="true" aria-labelledby="onboard-title" aria-describedby="onboard-intro">
    <form class="onboard-page__inner onboard__card" @submit.prevent="next">
      <header class="onboard__head">
        <p class="onboard__welcome">{{ t('onboarding.welcome') }}</p>
        <ol class="onboard__dots" :aria-label="t('onboarding.progress', { n: index + 1, total: steps.length })">
          <li v-for="(s, i) in steps" :key="s" :class="{ 'is-done': i < index, 'is-current': i === index }" />
        </ol>
      </header>

      <h2 id="onboard-title">{{ title }}</h2>
      <p id="onboard-intro" class="result__note">{{ intro }}</p>

      <div ref="body" :key="step" class="onboard__body">
        <div v-if="step === 'language'" class="onboard__options">
          <label v-for="l in LANGUAGES" :key="l.id" class="onboard__option" :class="{ 'is-selected': locale === l.id }">
            <input v-model="locale" type="radio" name="language" :value="l.id" />
            <span class="onboard__option-title" :lang="l.id">{{ l.label }}</span>
          </label>
        </div>

        <div v-else-if="step === 'rules'" class="onboard__options">
          <label v-for="r in RULE_OPTIONS" :key="r.id" class="onboard__option" :class="{ 'is-disabled': !r.playable, 'is-selected': rules === r.id }">
            <input v-model="rules" type="radio" name="rules" :value="r.id" :disabled="!r.playable" />
            <span class="onboard__option-title">{{ t(`rules.${r.id}`) }}</span>
            <span class="onboard__option-desc">{{ r.playable ? t(`onboarding.rules.${r.id}`) : t('onboarding.comingSoon') }}</span>
          </label>
        </div>

        <div v-else-if="step === 'customize'" class="onboard__options">
          <label class="onboard__option" :class="{ 'is-selected': !customizing }">
            <input v-model="customizing" type="radio" name="customize" :value="false" />
            <span class="onboard__option-title">{{ t('onboarding.customize.standard') }}</span>
            <span class="onboard__option-desc">{{ t('onboarding.customize.standardDesc') }}</span>
          </label>
          <label class="onboard__option" :class="{ 'is-selected': customizing }">
            <input v-model="customizing" type="radio" name="customize" :value="true" />
            <span class="onboard__option-title">{{ t('onboarding.customize.yes') }}</span>
            <span class="onboard__option-desc">{{ t('onboarding.customize.yesDesc') }}</span>
          </label>
        </div>

        <template v-else-if="question">
          <HouseQuestion :rules="rules" :option="question" :model-value="currentHouse[question]" @update:model-value="(v) => setOption(question!, v)" />
          <PayoutPreview v-if="PAYOUT_QUESTIONS.has(question)" :config="ruleConfig" :highlight="question === 'payment' ? 'discard' : 'curve'" />
        </template>

        <template v-else-if="step === 'summary'">
          <HouseSummary :config="ruleConfig" editable @edit="(key) => goTo(`q:${key}`)" />
          <PayoutPreview :config="ruleConfig" />
        </template>

        <TermsPicker v-else-if="step === 'terms'" v-model="terms" />

        <div v-else-if="step === 'defaults'" class="onboard__defaults">
          <div class="onboard__default">
            <button type="button" class="onboard__default-row" :aria-expanded="openRow === 'bots'" @click="toggleRow('bots')">
              <span>{{ t('app.bots') }}</span><strong>{{ t(`level.${difficulty}`) }}</strong>
            </button>
            <div v-if="openRow === 'bots'" class="onboard__options">
              <label v-for="l in LEVELS" :key="l" class="onboard__option" :class="{ 'is-selected': difficulty === l }">
                <input v-model="difficulty" type="radio" name="difficulty" :value="l" />
                <span class="onboard__option-title">{{ t(`level.${l}`) }}</span>
                <span class="onboard__option-desc">{{ t(`onboarding.level.${l}`) }}</span>
              </label>
            </div>
          </div>
          <div class="onboard__default">
            <button type="button" class="onboard__default-row" :aria-expanded="openRow === 'timer'" @click="toggleRow('timer')">
              <span>{{ t('app.claimTimer') }}</span><strong>{{ claimSeconds === 0 ? t('timer.off') : t('timer.seconds', { n: claimSeconds }) }}</strong>
            </button>
            <template v-if="openRow === 'timer'">
              <div class="onboard__row">
                <label v-for="s in CLAIM_TIMER_OPTIONS" :key="s" class="onboard__option onboard__option--compact" :class="{ 'is-selected': claimSeconds === s }">
                  <input v-model.number="claimSeconds" type="radio" name="timer" :value="s" />
                  <span class="onboard__option-title">{{ s === 0 ? t('timer.off') : t('timer.seconds', { n: s }) }}</span>
                </label>
              </div>
              <p class="onboard__hint">{{ claimSeconds === 0 ? t('onboarding.timer.off') : t('onboarding.timer.on', { n: claimSeconds }) }}</p>
            </template>
          </div>
          <div class="onboard__default">
            <button type="button" class="onboard__default-row" :aria-expanded="openRow === 'sound'" @click="toggleRow('sound')">
              <span>{{ t('app.sound') }}</span><strong>{{ sound ? t('onboarding.sound.on') : t('onboarding.sound.off') }}</strong>
            </button>
            <div v-if="openRow === 'sound'" class="onboard__options">
              <label class="onboard__option" :class="{ 'is-selected': sound }">
                <input :checked="sound" type="radio" name="sound" @change="chooseSound(true)" />
                <span class="onboard__option-title">{{ t('onboarding.sound.on') }}</span>
              </label>
              <label class="onboard__option" :class="{ 'is-selected': !sound }">
                <input :checked="!sound" type="radio" name="sound" @change="chooseSound(false)" />
                <span class="onboard__option-title">{{ t('onboarding.sound.off') }}</span>
              </label>
            </div>
          </div>
        </div>

        <div v-else-if="step === 'profile'" class="onboard__profile">
          <div class="profile__current">
            <span class="profile__preview" v-html="avatarSvg(profile.avatar.value)" />
            <label class="online__field">
              <span>{{ t('online.name') }}</span>
              <input v-model="profile.name.value" type="text" autocomplete="nickname" :maxlength="MAX_NAME_LENGTH" :placeholder="t('online.namePlaceholder')" />
            </label>
          </div>
          <AvatarPicker v-model="profile.avatar.value" />
        </div>

        <div v-else-if="step === 'start'" class="onboard__options">
          <button v-if="props.invite" type="button" class="onboard__option onboard__choice is-selected" @click="emit('done', 'join')">
            <span class="onboard__option-title">{{ t('onboarding.start.joinCode', { code: props.invite }) }}</span>
            <span class="onboard__option-desc">{{ t('onboarding.start.joinCodeDesc') }}</span>
          </button>
          <button type="button" class="onboard__option onboard__choice" @click="emit('done', 'solo')">
            <span class="onboard__option-title">{{ t('onboarding.start.solo') }}</span>
            <span class="onboard__option-desc">{{ t('onboarding.start.soloDesc') }}</span>
          </button>
          <button type="button" class="onboard__option onboard__choice" @click="emit('done', 'host')">
            <span class="onboard__option-title">{{ t('onboarding.start.host') }}</span>
            <span class="onboard__option-desc">{{ t('onboarding.start.hostDesc') }}</span>
          </button>
          <button v-if="!props.invite" type="button" class="onboard__option onboard__choice" @click="emit('done', 'join')">
            <span class="onboard__option-title">{{ t('onboarding.start.join') }}</span>
            <span class="onboard__option-desc">{{ t('onboarding.start.joinDesc') }}</span>
          </button>
          <button v-if="account.enabled && !account.signedIn.value" type="button" class="onboard__option onboard__choice onboard__choice--quiet" @click="emit('done', 'signIn')">
            <span class="onboard__option-title">{{ t('onboarding.start.signIn') }}</span>
            <span class="onboard__option-desc">{{ t('onboarding.start.signInDesc') }}</span>
          </button>
        </div>
      </div>

      <p v-if="step === 'rules' || step === 'terms' || step === 'defaults'" class="onboard__hint">{{ t('onboarding.later') }}</p>

      <footer class="onboard__nav">
        <button v-if="index > 0" type="button" class="action action--quiet-light" @click="back">{{ t('onboarding.back') }}</button>
        <span v-else />
        <template v-if="question">
          <span class="onboard__skips">
            <button type="button" class="linklike" @click="skipQuestion">{{ t('onboarding.useStandard') }}</button>
            <button type="button" class="linklike" @click="standardForRest">{{ t('onboarding.standardRest') }}</button>
          </span>
        </template>
        <button v-if="step !== 'start'" ref="nextButton" type="submit" class="action onboard__next">{{ t('onboarding.next') }}</button>
      </footer>
    </form>
  </section>
</template>
