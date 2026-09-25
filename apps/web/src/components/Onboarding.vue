<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Difficulty } from '../bots/protocol'
import { CLAIM_TIMER_OPTIONS, RULE_OPTIONS, useSettings } from '../game/settings'
import { playSound } from '../game/sound'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'

const emit = defineEmits<{ done: [] }>()

const { t, locale } = useI18n()
const { claimSeconds, sound, difficulty, rules } = useSettings()

const STEPS = ['language', 'rules', 'bots', 'timer', 'sound'] as const
const LEVELS: Difficulty[] = ['beginner', 'easy', 'medium', 'hard']
/** Shown in their own language, whatever the current one. */
const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'zh-Hans', label: '中文' },
] as const

const index = ref(0)
const step = computed(() => STEPS[index.value]!)
const last = computed(() => index.value === STEPS.length - 1)
const body = ref<HTMLElement | null>(null)

function next() {
  if (last.value) emit('done')
  else index.value++
}

/** Sound on: play a chime so the player hears what they chose. */
function chooseSound(on: boolean) {
  sound.value = on
  if (on) playSound('yourTurn')
}

/** Each step starts with its selected option focused, so arrow keys and Enter work straight away. */
async function focusStep() {
  await nextTick()
  body.value?.querySelector<HTMLInputElement>('input:checked')?.focus()
}
watch(index, focusStep)
onMounted(focusStep)

const titles: Record<(typeof STEPS)[number], MessageKey> = {
  language: 'onboarding.language.title',
  rules: 'onboarding.rules.title',
  bots: 'onboarding.bots.title',
  timer: 'onboarding.timer.title',
  sound: 'onboarding.sound.title',
}
const intros: Record<(typeof STEPS)[number], MessageKey> = {
  language: 'onboarding.language.body',
  rules: 'onboarding.rules.body',
  bots: 'onboarding.bots.body',
  timer: 'onboarding.timer.body',
  sound: 'onboarding.sound.body',
}
</script>

<template>
  <div class="result onboard" role="dialog" aria-modal="true" aria-labelledby="onboard-title" aria-describedby="onboard-intro">
    <form class="result__card onboard__card" @submit.prevent="next">
      <header class="onboard__head">
        <p class="onboard__welcome">{{ t('onboarding.welcome') }}</p>
        <ol class="onboard__dots" :aria-label="t('onboarding.progress', { n: index + 1, total: STEPS.length })">
          <li v-for="(s, i) in STEPS" :key="s" :class="{ 'is-done': i < index, 'is-current': i === index }" />
        </ol>
      </header>

      <h2 id="onboard-title">{{ t(titles[step]) }}</h2>
      <p id="onboard-intro" class="result__note">{{ t(intros[step]) }}</p>

      <div ref="body" :key="step" class="onboard__options">
        <template v-if="step === 'language'">
          <label v-for="l in LANGUAGES" :key="l.id" class="onboard__option" :class="{ 'is-selected': locale === l.id }">
            <input v-model="locale" type="radio" name="language" :value="l.id" />
            <span class="onboard__option-title" :lang="l.id">{{ l.label }}</span>
          </label>
        </template>

        <template v-else-if="step === 'rules'">
          <label v-for="r in RULE_OPTIONS" :key="r.id" class="onboard__option" :class="{ 'is-disabled': !r.playable, 'is-selected': rules === r.id }">
            <input v-model="rules" type="radio" name="rules" :value="r.id" :disabled="!r.playable" />
            <span class="onboard__option-title">{{ t(`rules.${r.id}`) }}</span>
            <span class="onboard__option-desc">{{ r.playable ? t(`onboarding.rules.${r.id}`) : t('onboarding.comingSoon') }}</span>
          </label>
        </template>

        <template v-else-if="step === 'bots'">
          <label v-for="l in LEVELS" :key="l" class="onboard__option" :class="{ 'is-selected': difficulty === l }">
            <input v-model="difficulty" type="radio" name="difficulty" :value="l" />
            <span class="onboard__option-title">{{ t(`level.${l}`) }}</span>
            <span class="onboard__option-desc">{{ t(`onboarding.level.${l}`) }}</span>
          </label>
        </template>

        <template v-else-if="step === 'timer'">
          <div class="onboard__row">
            <label v-for="s in CLAIM_TIMER_OPTIONS" :key="s" class="onboard__option onboard__option--compact" :class="{ 'is-selected': claimSeconds === s }">
              <input v-model.number="claimSeconds" type="radio" name="timer" :value="s" />
              <span class="onboard__option-title">{{ s === 0 ? t('timer.off') : t('timer.seconds', { n: s }) }}</span>
            </label>
          </div>
          <p class="onboard__hint">{{ claimSeconds === 0 ? t('onboarding.timer.off') : t('onboarding.timer.on', { n: claimSeconds }) }}</p>
        </template>

        <template v-else>
          <label class="onboard__option" :class="{ 'is-selected': sound }">
            <input :checked="sound" type="radio" name="sound" @change="chooseSound(true)" />
            <span class="onboard__option-title">{{ t('onboarding.sound.on') }}</span>
          </label>
          <label class="onboard__option" :class="{ 'is-selected': !sound }">
            <input :checked="!sound" type="radio" name="sound" @change="chooseSound(false)" />
            <span class="onboard__option-title">{{ t('onboarding.sound.off') }}</span>
          </label>
        </template>
      </div>

      <p class="onboard__hint">{{ t('onboarding.later') }}</p>

      <footer class="onboard__nav">
        <button v-if="index > 0" type="button" class="action action--quiet-light" @click="index--">{{ t('onboarding.back') }}</button>
        <button v-else type="button" class="action action--quiet-light" @click="emit('done')">{{ t('onboarding.skip') }}</button>
        <button type="submit" class="action onboard__next">{{ last ? t('onboarding.start') : t('onboarding.next') }}</button>
      </footer>
    </form>
  </div>
</template>
