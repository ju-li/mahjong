<script setup lang="ts">
import { computed } from 'vue'
import { houseKeys, houseOf, standardHouse, type HouseRules, type RuleSet } from '@mahjong/engine'
import { houseLabel, houseShort, houseValues } from '../../i18n/houseText'
import { useI18n } from '../../i18n/useI18n'
import PayoutPreview from './PayoutPreview.vue'

/** Every house rule of `rules` on one form, with the payout preview. Read-only when `disabled`. */
const props = defineProps<{ rules: RuleSet; modelValue: HouseRules; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [house: HouseRules] }>()

const { t } = useI18n()
const house = computed(() => houseOf({ rules: props.rules, house: props.modelValue }) as Record<string, unknown>)

function set(key: string, index: number) {
  emit('update:modelValue', { ...house.value, [key]: houseValues(props.rules, key)[index] } as HouseRules)
}
</script>

<template>
  <div class="house__editor">
    <label v-for="key in houseKeys(rules)" :key="key" class="select">
      <span>{{ t(houseShort(rules, key)) }}</span>
      <select :value="houseValues(rules, key).indexOf(house[key])" :disabled="disabled" :aria-label="t(houseShort(rules, key))" @change="set(key, Number(($event.target as HTMLSelectElement).value))">
        <option v-for="(v, i) in houseValues(rules, key)" :key="String(v)" :value="i">{{ t(houseLabel(rules, key, v)) }}</option>
      </select>
    </label>
    <button v-if="!disabled" type="button" class="linklike" @click="emit('update:modelValue', standardHouse(rules))">{{ t('house.reset') }}</button>
    <PayoutPreview :config="{ rules, house: modelValue }" />
  </div>
</template>
