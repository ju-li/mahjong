<script setup lang="ts">
import { computed } from 'vue'
import type { Difficulty } from './bots/protocol'
import GameTable from './components/GameTable.vue'
import HandResult from './components/HandResult.vue'
import ScoreBoard from './components/ScoreBoard.vue'
import { useMatch } from './game/useMatch'

/** Per player. Bots are named by where they sit relative to you at the start of the match. */
const NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3']
const LEVELS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const { match, seatPlayers, view, humanActions, handOver, matchOver, difficulty, act, continueToNextHand, startNewMatch } = useMatch()

const result = computed(() => (view.value?.phase.kind === 'ended' ? view.value.phase.result : null))
/** Names in table-seat order for this round. */
const seatNames = computed(() => seatPlayers.value.map((p) => NAMES[p]!))
/** Match totals in seat order, including the hand just finished. */
const seatTotals = computed(() =>
  seatPlayers.value.map((p, seat) => match.value.scores[p]! + (result.value?.type === 'win' ? result.value.deltas[seat]! : 0)),
)

function confirmNewMatch() {
  const inProgress = match.value.history.length > 0 || (match.value.current && !handOver.value)
  if (!inProgress || window.confirm('Abandon this match and start a new one?')) startNewMatch()
}
</script>

<template>
  <main class="app">
    <header class="topbar">
      <h1>Mahjong <small>MCR</small></h1>
      <div class="topbar__controls">
        <label class="select">
          <span>Bots</span>
          <select v-model="difficulty" aria-label="Bot difficulty">
            <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </label>
        <button class="action" @click="confirmNewMatch">New match</button>
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
    />

    <section v-if="!view" class="result__card result__card--inline">
      <h2>Match finished</h2>
      <button class="action action--primary" @click="startNewMatch">New match</button>
    </section>
  </main>
</template>
