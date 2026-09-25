<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { legalActions, newHand, viewFor } from '@mahjong/engine'
import type { BotRequest, BotResponse } from './bots/protocol'

const reply = ref<BotResponse | null>(null)
let worker: Worker | undefined

onMounted(() => {
  worker = new Worker(new URL('./bots/bot.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<BotResponse>) => {
    reply.value = event.data
  }
  const state = newHand({ seed: 1, dealer: 0, prevailingWind: 'E' })
  const request: BotRequest = { id: 1, view: viewFor(state, 0), legal: legalActions(state, 0), difficulty: 'easy', seed: 1 }
  worker.postMessage(request)
})

onBeforeUnmount(() => worker?.terminate())
</script>

<template>
  <main>
    <h1>Mahjong (MCR)</h1>
    <p v-if="reply" data-testid="worker-reply">
      Bot worker replied: <code>{{ JSON.stringify(reply) }}</code>
    </p>
    <p v-else>Waiting for bot worker…</p>
  </main>
</template>
