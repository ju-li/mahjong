<script setup lang="ts">
import { computed, ref } from 'vue'
import { HANDS_PER_MATCH } from '@mahjong/engine'
import type { Difficulty } from './bots/protocol'
import FanReference from './components/FanReference.vue'
import GameTable from './components/GameTable.vue'
import HandResult from './components/HandResult.vue'
import { avatarSeeds, avatarSvg } from './game/avatar'
import { CLAIM_TIMER_OPTIONS, useSettings } from './game/settings'
import { useMatch } from './game/useMatch'
import { useI18n } from './i18n/useI18n'

const { t, toggle } = useI18n()

/** Fan list dialog: `null` = closed, '' = open at the top, otherwise the fan to show. */
const fanList = ref<string | null>(null)

/** Per player. Bots are numbered by where they sit relative to you at the start of the match. */
const NAMES = computed(() => [t('player.you'), t('player.bot', { n: 1 }), t('player.bot', { n: 2 }), t('player.bot', { n: 3 })])
const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

const { claimSeconds, sound } = useSettings()
const { match, seatPlayers, view, humanActions, claimRemaining, handOver, matchOver, difficulty, act, continueToNextHand, startNewMatch } = useMatch()

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

function confirmNewMatch() {
  const inProgress = match.value.history.length > 0 || (match.value.current && !handOver.value)
  if (!inProgress || window.confirm(t('app.confirmNewMatch'))) startNewMatch()
}
</script>

<template>
  <main class="app">
    <header class="topbar">
      <h1>{{ t('app.title') }} <small>{{ t('app.subtitle') }}</small></h1>
      <div class="topbar__controls">
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
        <button class="action action--quiet-light" :aria-pressed="sound" @click="sound = !sound">
          {{ sound ? t('app.soundOn') : t('app.soundOff') }}
        </button>
        <button class="action action--quiet-light" @click="fanList = ''">{{ t('app.fanReference') }}</button>
        <button class="action action--quiet-light" :aria-label="t('app.language')" @click="toggle">{{ t('app.switchLanguage') }}</button>
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
      :match-over="matchOver || match.handIndex === 15"
      :final-scores="seatTotals"
      @next="continueToNextHand"
      @new-match="startNewMatch"
      @explain="(id: string) => (fanList = id)"
    />

    <FanReference v-if="fanList !== null" :focus="fanList || null" @close="fanList = null" />

    <section v-if="!view" class="result__card result__card--inline">
      <h2>{{ t('app.matchFinished') }}</h2>
      <button class="action action--primary" @click="startNewMatch">{{ t('app.newMatch') }}</button>
    </section>
  </main>
</template>
