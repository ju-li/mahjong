<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { normalizeHouseRules, type HouseRules, type RuleSet } from '@mahjong/engine'
import { useI18n } from '../../i18n/useI18n'
import HouseRulesEditor from './HouseRulesEditor.vue'

/**
 * Edit the house rules of `rules` in a dialog; changes apply on Save.
 * `readOnly` shows them to players who may not change them. With `offerDefault`, the host can
 * also keep the change as their own default.
 */
const props = defineProps<{ rules: RuleSet; initial: HouseRules; readOnly?: boolean; offerDefault?: boolean; note?: string }>()
const emit = defineEmits<{ save: [house: HouseRules, asDefault: boolean]; close: [] }>()

const { t } = useI18n()
const draft = ref<HouseRules>(normalizeHouseRules(props.rules, props.initial))
const asDefault = ref(false)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result" role="dialog" aria-modal="true" aria-labelledby="house-title" @click.self="emit('close')">
    <form class="result__card settings" @submit.prevent="emit('save', draft, asDefault)">
      <h2 id="house-title">{{ t('house.title') }} <small>{{ t(`rules.${rules}`) }}</small></h2>
      <p v-if="note" class="result__note">{{ note }}</p>
      <HouseRulesEditor v-model="draft" :rules="rules" :disabled="readOnly" />
      <label v-if="offerDefault && !readOnly" class="select toggle">
        <span class="toggle__label">{{ t('house.saveAsDefault') }}</span>
        <input v-model="asDefault" class="toggle__input" type="checkbox" role="switch" />
      </label>
      <div class="profile__buttons">
        <button type="button" class="action" @click="emit('close')">{{ readOnly ? t('fans.close') : t('online.cancel') }}</button>
        <button v-if="!readOnly" type="submit" class="action action--primary">{{ t('house.save') }}</button>
      </div>
    </form>
  </div>
</template>
