<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Difficulty } from './bots/protocol'
import FanReference from './components/FanReference.vue'
import GameTable from './components/GameTable.vue'
import HandResult from './components/HandResult.vue'
import ScoreBoard from './components/ScoreBoard.vue'
import { useMatch } from './game/useMatch'
import { useI18n } from './i18n/useI18n'

const { t, toggle } = useI18n()

/** Fan list dialog: `null` = closed, '' = open at the top, otherwise the fan to show. */
const fanList = ref<string | null>(null)

/** Per player. Bots are numbered by where they sit relative to you at the start of the match. */
const NAMES = computed(() => [t('player.you'), t('player.bot', { n: 1 }), t('player.bot', { n: 2 }), t('player.bot', { n: 3 })])
const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

const { match, seatPlayers, view, humanActions, handOver, matchOver, difficulty, act, continueToNextHand, startNewMatch } = useMatch()

const result = computed(() => (view.value?.phase.kind === 'ended' ? view.value.phase.result : null))
/** Names in table-seat order for this round. */
const seatNames = computed(() => seatPlayers.value.map((p) => NAMES.value[p]!))
/** Match totals in seat order, including the hand just finished. */
const seatTotals = computed(() =>
  seatPlayers.value.map((p, seat) => match.value.scores[p]! + (result.value?.type === 'win' ? result.value.deltas[seat]! : 0)),
)

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
        <button class="action action--quiet-light" @click="fanList = ''">{{ t('app.fanReference') }}</button>
        <button class="action action--quiet-light" :aria-label="t('app.language')" @click="toggle">{{ t('app.switchLanguage') }}</button>
        <button class="action" @click="confirmNewMatch">{{ t('app.newMatch') }}</button>
      </div>
    </header>

    <ScoreBoard :match="match" :names="NAMES" :seat-winds="view?.seatWinds ?? null" />

    <GameTable v-if="view" :view="view" :actions="humanActions" :names="seatNames" @act="act" />

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
