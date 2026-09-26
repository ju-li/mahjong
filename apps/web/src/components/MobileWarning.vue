<script setup lang="ts">
import { useI18n } from '../i18n/useI18n'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="result" role="alertdialog" aria-modal="true" aria-labelledby="mobile-title" aria-describedby="mobile-body">
    <div class="result__card pause">
      <h2 id="mobile-title">{{ t('mobile.title') }}</h2>
      <p id="mobile-body">{{ t('mobile.body') }}</p>
      <button class="action action--primary" autofocus @click="emit('close')">{{ t('mobile.ok') }}</button>
    </div>
  </div>
</template>
