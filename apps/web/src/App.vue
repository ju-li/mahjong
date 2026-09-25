<script setup lang="ts">
import GameTable from './components/GameTable.vue'
import { useGame } from './game/useGame'

const NAMES = ['You', 'Bot Right', 'Bot Across', 'Bot Left']

const { view, humanActions, act, startHand } = useGame()
</script>

<template>
  <main class="app">
    <header class="topbar">
      <h1>Mahjong <small>MCR</small></h1>
      <button class="action" @click="startHand()">New hand</button>
    </header>
    <GameTable :view="view" :actions="humanActions" :names="NAMES" @act="act" />
  </main>
</template>
