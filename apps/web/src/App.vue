<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { BotReply } from './bots/bot.worker'

const reply = ref<BotReply | null>(null)
let worker: Worker | undefined

onMounted(() => {
  worker = new Worker(new URL('./bots/bot.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<BotReply>) => {
    reply.value = event.data
  }
  worker.postMessage('hello from App.vue')
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
