<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { HANDS_PER_MATCH, isRuleSet } from '@mahjong/engine'
import type { Difficulty } from './bots/protocol'
import FanReference from './components/FanReference.vue'
import GameTable from './components/GameTable.vue'
import HandResult from './components/HandResult.vue'
import Onboarding from './components/Onboarding.vue'
import RulesReference from './components/RulesReference.vue'
import { avatarSeeds, avatarSvg } from './game/avatar'
import { CLAIM_TIMER_OPTIONS, RULE_OPTIONS, TEXT_SIZE_OPTIONS, useSettings } from './game/settings'
import { useMatch } from './game/useMatch'
import { useI18n } from './i18n/useI18n'

const { t, toggle } = useI18n()

/** Fan list dialog: `null` = closed, '' = open at the top, otherwise the fan to show. */
const fanList = ref<string | null>(null)
/** How-to-play dialog. */
const rulesOpen = ref(false)

/** Per player. Bots are numbered by where they sit relative to you at the start of the match. */
const NAMES = computed(() => [t('player.you'), t('player.bot', { n: 1 }), t('player.bot', { n: 2 }), t('player.bot', { n: 3 })])
const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

const { claimSeconds, sound, voice, textSize, needsOnboarding, finishOnboarding, rules: preferredRules } = useSettings()
const { match, seatPlayers, view, humanActions, claimRemaining, handOver, matchOver, difficulty, rules, resumed, act, continueToNextHand, startNewMatch } = useMatch()

const result = computed(() => (view.value?.phase.kind === 'ended' ? view.value.phase.result : null))
/** Names in table-seat order for this round. */
const seatNames = computed(() => seatPlayers.value.map((p) => NAMES.value[p]!))
/** Match totals in seat order, including the hand just finished. */
const seatTotals = computed(() =>
  seatPlayers.value.map((p, seat) => match.value.scores[p]! + (result.value?.type === 'win' ? result.value.deltas[seat]! : 0)),
)

/** Match totals in seat order, before the hand in play. */
const seatScores = computed(() => seatPlayers.value.map((p) => match.value.scores[p]!))
/** A random face per player, fixed for the whole match. */
const playerAvatars = computed(() => avatarSeeds(match.value.seed).map(avatarSvg))
const seatAvatars = computed(() => seatPlayers.value.map((p) => playerAvatars.value[p]!))
const handLabel = computed(() => t('score.hand', { n: Math.min(match.value.handIndex + 1, HANDS_PER_MATCH), total: HANDS_PER_MATCH }))

/** Settings dropdown; closes on a click outside it or Escape. */
const settingsMenu = ref<HTMLDetailsElement | null>(null)
function closeSettings(e: Event) {
  const menu = settingsMenu.value
  if (!menu?.open) return
  if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.contains(e.target as Node)) menu.open = false
}
onMounted(() => {
  document.addEventListener('pointerdown', closeSettings)
  document.addEventListener('keydown', closeSettings)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeSettings)
  document.removeEventListener('keydown', closeSettings)
})

const inProgress = () => match.value.history.length > 0 || (match.value.current !== null && !handOver.value)

function confirmNewMatch() {
  if (!inProgress() || window.confirm(t('app.confirmNewMatch'))) startNewMatch()
}

/**
 * First visit: deal again under the chosen rules. A match restored from an older
 * version is only abandoned if the player agrees.
 */
function onboardingDone() {
  const next = preferredRules.value
  finishOnboarding()
  if (next === rules.value) return
  if (!resumed || !inProgress() || window.confirm(t('app.confirmRules'))) startNewMatch(next)
  else preferredRules.value = rules.value
}

/** Switching rules starts a new match, after confirming if one is under way. */
function changeRules(e: Event) {
  const select = e.target as HTMLSelectElement
  const next = select.value
  if (isRuleSet(next) && next !== rules.value && (!inProgress() || window.confirm(t('app.confirmRules')))) startNewMatch(next)
  else select.value = rules.value
}
</script>

<template>
  <main class="app">
    <header class="topbar">
      <h1>{{ t('app.title') }} <small>{{ t(`rules.short.${rules}`) }}</small></h1>
      <div class="topbar__controls">
        <details ref="settingsMenu" class="menu">
          <summary class="action action--quiet-light">{{ t('app.settings') }}</summary>
          <div class="menu__panel">
            <label class="select">
              <span>{{ t('app.rules') }}</span>
              <select :value="rules" :aria-label="t('app.rules')" @change="changeRules">
                <option v-for="r in RULE_OPTIONS" :key="r.id" :value="r.id" :disabled="!r.playable">
                  {{ r.playable ? t(`rules.${r.id}`) : t('rules.comingSoon', { name: t(`rules.${r.id}`) }) }}
                </option>
              </select>
            </label>
            <label class="select">
              <span>{{ t('app.bots') }}</span>
              <select v-model="difficulty" :aria-label="t('app.botDifficulty')">
                <option v-for="l in LEVELS" :key="l" :value="l">{{ t(`level.${l}`) }}</option>
              </select>
            </label>
            <label class="select">
              <span>{{ t('app.claimTimer') }}</span>
              <select v-model.number="claimSeconds" :aria-label="t('app.claimTimer')">
                <option v-for="s in CLAIM_TIMER_OPTIONS" :key="s" :value="s">{{ s === 0 ? t('timer.off') : t('timer.seconds', { n: s }) }}</option>
              </select>
            </label>
            <label class="select">
              <span>{{ t('app.textSize') }}</span>
              <select v-model="textSize" :aria-label="t('app.textSize')">
                <option v-for="s in TEXT_SIZE_OPTIONS" :key="s" :value="s">{{ t(`textSize.${s}`) }}</option>
              </select>
            </label>
            <label class="select toggle">
              <span class="toggle__label">
                <svg class="toggle__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                  <template v-if="sound">
                    <path d="M16 9a4 4 0 0 1 0 6" />
                    <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
                  </template>
                  <path v-else d="M16 9l5 6M21 9l-5 6" />
                </svg>
                {{ t('app.sound') }}
              </span>
              <input v-model="sound" class="toggle__input" type="checkbox" role="switch" />
            </label>
            <label class="select toggle">
              <span class="toggle__label">
                <svg class="toggle__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" :fill="voice ? 'currentColor' : 'none'" />
                </svg>
                {{ t('app.voice') }}
              </span>
              <input v-model="voice" class="toggle__input" type="checkbox" role="switch" />
            </label>
            <button class="action action--quiet-light" :aria-label="t('app.language')" @click="toggle">{{ t('app.switchLanguage') }}</button>
          </div>
        </details>
        <button class="action action--quiet-light" @click="rulesOpen = true">{{ t('app.howToPlay') }}</button>
        <button class="action action--quiet-light" @click="fanList = ''">{{ t('app.fanReference') }}</button>
        <button class="action" @click="confirmNewMatch">{{ t('app.newMatch') }}</button>
      </div>
    </header>

    <GameTable
      v-if="view"
      :key="`${match.seed}:${match.handIndex}`"
      :view="view"
      :actions="humanActions"
      :names="seatNames"
      :scores="seatScores"
      :avatars="seatAvatars"
      :hand-label="handLabel"
      :claim-remaining="claimRemaining"
      @act="act"
    />
    <p v-if="view" class="keys-help">{{ t('keys.help') }}</p>

    <HandResult
      v-if="view && result"
      :result="result"
      :view="view"
      :names="seatNames"
      :avatars="seatAvatars"
      :match-over="matchOver || match.handIndex === 15"
      :final-scores="seatTotals"
      @next="continueToNextHand"
      @new-match="startNewMatch()"
      @explain="(id: string) => (fanList = id)"
    />

    <RulesReference v-if="rulesOpen" :rules="rules" @close="rulesOpen = false" @fans="rulesOpen = false; fanList = ''" />
    <FanReference v-if="fanList !== null" :focus="fanList || null" :rules="rules" @close="fanList = null" />

    <Onboarding v-if="needsOnboarding" @done="onboardingDone" />

    <section v-if="!view" class="result__card result__card--inline">
      <h2>{{ t('app.matchFinished') }}</h2>
      <button class="action action--primary" @click="startNewMatch()">{{ t('app.newMatch') }}</button>
    </section>
  </main>
</template>
