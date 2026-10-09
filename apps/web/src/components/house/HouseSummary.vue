<script setup lang="ts">
import { computed } from 'vue'
import { houseDiff, houseKeys, houseOf, type RuleConfig } from '@mahjong/engine'
import { houseLabel, houseShort } from '../../i18n/houseText'
import { useI18n } from '../../i18n/useI18n'

/**
 * The house rules of `config`: every option, or only the ones that differ from the standard.
 * With `editable`, each row has an Edit button.
 */
const props = defineProps<{ config: RuleConfig; onlyChanges?: boolean; editable?: boolean }>()
const emit = defineEmits<{ edit: [option: string] }>()

const { t } = useI18n()
const changed = computed(() => new Set(houseDiff(props.config).map((d) => d.key)))
const rows = computed(() => {
  const house = houseOf(props.config) as Record<string, unknown>
  return houseKeys(props.config.rules)
    .filter((key) => !props.onlyChanges || changed.value.has(key))
    .map((key) => ({ key, value: house[key], changed: changed.value.has(key) }))
})
</script>

<template>
  <p v-if="rows.length === 0" class="result__note">{{ t('onboarding.summary.none') }}</p>
  <dl v-else class="house__summary">
    <div v-for="r in rows" :key="r.key" class="house__row" :class="{ 'is-changed': r.changed }">
      <dt>{{ t(houseShort(config.rules, r.key)) }}</dt>
      <dd>
        {{ t(houseLabel(config.rules, r.key, r.value)) }}
        <button v-if="editable" type="button" class="linklike" @click="emit('edit', r.key)">{{ t('house.edit') }}</button>
      </dd>
    </div>
  </dl>
</template>
