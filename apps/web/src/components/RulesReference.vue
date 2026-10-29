<script setup lang="ts">
import { computed } from 'vue'
import { isStandard, maximumFor, minimumFor, type RuleConfig } from '@mahjong/engine'
import HouseSummary from './house/HouseSummary.vue'
import type { MessageKey } from '../i18n/messages'
import { ruleKey } from '../i18n/ruleKeys'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{ config: RuleConfig }>()
const emit = defineEmits<{ fans: [] }>()

const { t } = useI18n()

/** Each section: a heading and its paragraphs. Winning and scoring differ per rule set. */
const sections = computed(() => {
  const rules = props.config.rules
  const sg = rules === 'sg'
  const list: { title: MessageKey; body: MessageKey[] }[] = [
    { title: 'guide.goal.title', body: ['guide.goal.body'] },
    { title: 'guide.tiles.title', body: ['guide.tiles.body', 'guide.tiles.flowers', ...(sg ? (['guide.tiles.animalsSg'] as const) : [])] },
    { title: 'guide.turn.title', body: ['guide.turn.body', sg ? 'guide.turn.endSg' : 'guide.turn.end'] },
    { title: 'guide.claims.title', body: ['guide.claims.chow', 'guide.claims.pung', 'guide.claims.kong', 'guide.claims.priority'] },
    { title: 'guide.win.title', body: [ruleKey('guide.win.body', rules)] },
    { title: 'guide.scoring.title', body: [ruleKey('guide.scoring.body', rules), ...(sg ? (['guide.scoring.bitesSg'] as const) : [])] },
    { title: 'guide.match.title', body: [ruleKey('guide.match.body', rules)] },
  ]
  return list
})
/** The table's minimum and limit, for paragraphs that quote them. */
const limits = computed(() => ({ min: minimumFor(props.config), max: maximumFor(props.config) ?? '' }))
</script>

<template>
  <div class="tabs__body">
    <section v-if="!isStandard(config)" class="guide__section">
      <h3>{{ t('house.tableTitle') }}</h3>
      <HouseSummary :config="config" only-changes />
    </section>
    <section v-for="s in sections" :key="s.title" class="guide__section">
      <h3>{{ t(s.title) }}</h3>
      <p v-for="p in s.body" :key="p">{{ t(p, limits) }}</p>
    </section>
    <p class="guide__more">
      <button class="linklike" @click="emit('fans')">{{ t('guide.seeFans') }}</button>
    </p>
  </div>
</template>
