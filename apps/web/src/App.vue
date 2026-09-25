<script setup lang="ts">
import { computed } from 'vue'
import type { Difficulty } from './bots/protocol'
import GameTable from './components/GameTable.vue'
import HandResult from './components/HandResult.vue'
import ScoreBoard from './components/ScoreBoard.vue'
import { useMatch } from './game/useMatch'

const NAMES = ['You', 'Bot Right', 'Bot Across', 'Bot Left']
const LEVELS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const { match, view, humanActions, handOver, matchOver, difficulty, act, continueToNextHand, startNewMatch } = useMatch()

const result = computed(() => (view.value?.phase.kind === 'ended' ? view.value.phase.result : null))

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

    <GameTable v-if="view" :view="view" :actions="humanActions" :names="NAMES" @act="act" />

    <HandResult
      v-if="view && result"
      :result="result"
      :view="view"
      :names="NAMES"
      :match-over="matchOver || match.handIndex === 15"
      :final-scores="match.scores.map((s, i) => s + (result?.type === 'win' ? result.deltas[i]! : 0))"
      @next="continueToNextHand"
      @new-match="startNewMatch"
    />

    <section v-if="!view" class="result__card result__card--inline">
      <h2>Match finished</h2>
      <button class="action action--primary" @click="startNewMatch">New match</button>
    </section>
  </main>
</template>
