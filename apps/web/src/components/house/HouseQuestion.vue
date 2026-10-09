<script setup lang="ts">
import type { RuleSet } from '@mahjong/engine'
import { STANDARD_HOUSE } from '@mahjong/engine'
import { houseHint, houseLabel, houseValues } from '../../i18n/houseText'
import { useI18n } from '../../i18n/useI18n'

/** One house-rule question as option cards; the standard answer is marked. */
const props = defineProps<{ rules: RuleSet; option: string; modelValue: unknown }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const { t } = useI18n()
const standard = (value: unknown) => (STANDARD_HOUSE[props.rules] as Record<string, unknown>)[props.option] === value
</script>

<template>
  <div class="onboard__options" role="radiogroup">
    <label v-for="v in houseValues(rules, option)" :key="String(v)" class="onboard__option" :class="{ 'is-selected': modelValue === v }">
      <input type="radio" :name="`house-${option}`" :checked="modelValue === v" @change="emit('update:modelValue', v)" />
      <span class="onboard__option-title">
        {{ t(houseLabel(rules, option, v)) }}
        <small v-if="standard(v)" class="house__standard">{{ t('house.standardTag') }}</small>
      </span>
      <span class="onboard__option-desc">{{ t(houseHint(rules, option, v)) }}</span>
    </label>
  </div>
</template>
