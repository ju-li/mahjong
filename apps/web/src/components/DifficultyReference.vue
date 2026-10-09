<script setup lang="ts">
import { DIFFICULTIES } from '@mahjong/bots'
import { minimumFor, type RuleConfig } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'

/** How the bot level is chosen, and what changes from one level to the next. */
defineProps<{ config: RuleConfig }>()

const { t } = useI18n()
</script>

<template>
  <div class="tabs__body">
    <section class="guide__section">
      <h3>{{ t('difficulty.set.title') }}</h3>
      <p>{{ t('difficulty.set.body') }}</p>
      <p>{{ t('difficulty.fair') }}</p>
    </section>
    <section v-for="l in DIFFICULTIES" :key="l" class="guide__section">
      <h3>{{ t(`level.${l}`) }}</h3>
      <p>{{ t(`difficulty.${l}`, { min: t(config.rules === 'hk' ? 'difficulty.minHk' : 'difficulty.min', { n: minimumFor(config) }) }) }}</p>
    </section>
  </div>
</template>
