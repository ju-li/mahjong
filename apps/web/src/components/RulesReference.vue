<script setup lang="ts">
import { computed } from 'vue'
import type { RuleSet } from '@mahjong/engine'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{ rules: RuleSet }>()
const emit = defineEmits<{ fans: [] }>()

const { t } = useI18n()

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
</script>

<template>
  <div class="tabs__body">
    <section v-for="s in sections" :key="s.title" class="guide__section">
      <h3>{{ t(s.title) }}</h3>
      <p v-for="p in s.body" :key="p">{{ t(p) }}</p>
    </section>
    <p class="guide__more">
      <button class="linklike" @click="emit('fans')">{{ t('guide.seeFans') }}</button>
    </p>
  </div>
</template>
