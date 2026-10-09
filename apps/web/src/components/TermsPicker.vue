<script setup lang="ts">
import { TERM_IDS, TERM_OPTIONS, type TermId, type Terms } from '../i18n/terms'
import { useI18n } from '../i18n/useI18n'

/** One row of choices per Chinese term, each with an example of how it reads. */
const props = defineProps<{ modelValue: Terms }>()
const emit = defineEmits<{ 'update:modelValue': [terms: Terms] }>()

const { t } = useI18n()
const choose = (id: TermId, word: string) => emit('update:modelValue', { ...props.modelValue, [id]: word } as Terms)
</script>

<template>
  <div class="terms">
    <fieldset v-for="id in TERM_IDS" :key="id" class="terms__row">
      <legend>{{ t(`terms.${id}`) }}</legend>
      <div class="terms__choices" role="radiogroup" :aria-label="t(`terms.${id}`)">
        <label v-for="word in TERM_OPTIONS[id]" :key="word" class="onboard__option onboard__option--compact" :class="{ 'is-selected': modelValue[id] === word }">
          <input type="radio" :name="`term-${id}`" :checked="modelValue[id] === word" @change="choose(id, word)" />
          <span class="onboard__option-title" lang="zh-Hans">{{ word }}</span>
        </label>
      </div>
      <p class="onboard__hint" lang="zh-Hans">{{ t(`terms.${id}.example`, { w: modelValue[id] }) }}</p>
    </fieldset>
  </div>
</template>
