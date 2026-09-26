<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RuleSet } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'
import FanReference from './FanReference.vue'
import RulesReference from './RulesReference.vue'

export type RulesTab = 'rules' | 'fans'

const props = defineProps<{ tab: RulesTab; focus?: string | null; rules: RuleSet }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const active = ref<RulesTab>(props.tab)
const closeButton = ref<HTMLButtonElement | null>(null)
const card = ref<HTMLElement | null>(null)
const TABS: { id: RulesTab; label: 'app.howToPlay' | 'app.fanReference' }[] = [
  { id: 'rules', label: 'app.howToPlay' },
  { id: 'fans', label: 'app.fanReference' },
]

function select(tab: RulesTab) {
  active.value = tab
  card.value?.scrollTo({ top: 0 })
}

/** Arrow keys move between tabs, as in the WAI-ARIA tabs pattern. */
function onTabKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const i = TABS.findIndex((x) => x.id === active.value)
  const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!
  select(next.id)
  nextTick(() => document.getElementById(`rules-tab-${next.id}`)?.focus())
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  closeButton.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result fans" role="dialog" aria-modal="true" aria-labelledby="rules-title" @click.self="emit('close')">
    <div ref="card" class="result__card fans__card">
      <header class="fans__head">
        <h2 id="rules-title">
          {{ active === 'rules' ? t('guide.title', { rules: t(`rules.${rules}`) }) : rules === 'hk' ? t('fans.titleHk') : t('fans.title') }}
        </h2>
        <button ref="closeButton" class="action" @click="emit('close')">{{ t('fans.close') }}</button>
      </header>
      <div class="tabs" role="tablist" @keydown="onTabKey">
        <button
          v-for="x in TABS"
          :id="`rules-tab-${x.id}`"
          :key="x.id"
          class="tabs__tab"
          :class="{ 'is-active': active === x.id }"
          role="tab"
          :aria-selected="active === x.id"
          :aria-controls="`rules-panel-${x.id}`"
          :tabindex="active === x.id ? 0 : -1"
          @click="select(x.id)"
        >
          {{ t(x.label) }}
        </button>
      </div>
      <div :id="`rules-panel-${active}`" class="tabs__panel" role="tabpanel" :aria-labelledby="`rules-tab-${active}`">
        <RulesReference v-if="active === 'rules'" :rules="rules" @fans="select('fans')" />
        <FanReference v-else :focus="focus" :rules="rules" />
      </div>
    </div>
  </div>
</template>
