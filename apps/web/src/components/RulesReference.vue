<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RuleSet } from '@mahjong/engine'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{ rules: RuleSet }>()
const emit = defineEmits<{ close: []; fans: [] }>()

const { t } = useI18n()
const closeButton = ref<HTMLButtonElement | null>(null)

/** Each section: a heading and its paragraphs. Winning and scoring differ per rule set. */
const sections = computed(() => {
  const hk = props.rules === 'hk'
  const list: { title: MessageKey; body: MessageKey[] }[] = [
    { title: 'guide.goal.title', body: ['guide.goal.body'] },
    { title: 'guide.tiles.title', body: ['guide.tiles.body', 'guide.tiles.flowers'] },
    { title: 'guide.turn.title', body: ['guide.turn.body', 'guide.turn.end'] },
    { title: 'guide.claims.title', body: ['guide.claims.chow', 'guide.claims.pung', 'guide.claims.kong', 'guide.claims.priority'] },
    { title: 'guide.win.title', body: hk ? ['guide.win.bodyHk'] : ['guide.win.body'] },
    { title: 'guide.scoring.title', body: hk ? ['guide.scoring.bodyHk'] : ['guide.scoring.body'] },
    { title: 'guide.match.title', body: [hk ? 'guide.match.bodyHk' : 'guide.match.body'] },
  ]
  return list
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await nextTick()
  closeButton.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result fans" role="dialog" aria-modal="true" aria-labelledby="guide-title" @click.self="emit('close')">
    <div class="result__card fans__card">
      <header class="fans__head">
        <h2 id="guide-title">{{ t('guide.title', { rules: t(`rules.${rules}`) }) }}</h2>
        <button ref="closeButton" class="action" @click="emit('close')">{{ t('fans.close') }}</button>
      </header>
      <section v-for="s in sections" :key="s.title" class="guide__section">
        <h3>{{ t(s.title) }}</h3>
        <p v-for="p in s.body" :key="p">{{ t(p) }}</p>
      </section>
      <p class="guide__more">
        <button class="linklike" @click="emit('fans')">{{ t('guide.seeFans') }}</button>
      </p>
    </div>
  </div>
</template>
