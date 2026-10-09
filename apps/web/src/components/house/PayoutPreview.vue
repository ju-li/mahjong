<script setup lang="ts">
import { computed } from 'vue'
import { paymentTable, type RuleConfig } from '@mahjong/engine'
import { useI18n } from '../../i18n/useI18n'

/** What a win pays under `config`: per total, the discarder, each other loser, and each loser on a self-draw. */
const props = defineProps<{ config: RuleConfig; highlight?: 'discard' | 'curve' }>()

const { t } = useI18n()
const rows = computed(() => paymentTable(props.config))
</script>

<template>
  <figure class="payout">
    <figcaption>{{ t('payout.title') }}</figcaption>
    <table class="explain__table payout__table">
      <thead>
        <tr>
          <th>{{ t(config.rules === 'hk' ? 'payout.faan' : 'payout.fan') }}</th>
          <th class="num" :class="{ 'is-focus': highlight === 'discard' }">{{ t('payout.discarder') }}</th>
          <th class="num" :class="{ 'is-focus': highlight === 'discard' }">{{ t('payout.others') }}</th>
          <th class="num">{{ t('payout.selfDraw') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.total">
          <td :class="{ 'is-focus': highlight === 'curve' }">{{ r.total }}</td>
          <td class="num">{{ r.discarder }}</td>
          <td class="num">{{ r.other }}</td>
          <td class="num">{{ r.selfDraw }}</td>
        </tr>
      </tbody>
    </table>
  </figure>
</template>
