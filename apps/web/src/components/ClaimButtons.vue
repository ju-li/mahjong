<script setup lang="ts">
import type { Action, Tile } from '@mahjong/engine'
import { shortcutFor } from '../game/keyboard'
import { useI18n } from '../i18n/useI18n'
import TileFace from './TileFace.vue'

/** The claim and turn buttons (Mahjong!, Pung, Chow…, Pass), with their shortcut keys. */
const props = defineProps<{ actions: Action[]; hand: Tile[] }>()
const emit = defineEmits<{ act: [action: Action] }>()

const { t } = useI18n()

function actionLabel(a: Action): string {
  switch (a.type) {
    case 'win':
      return t('action.win')
    case 'pung':
      return t('action.pung')
    case 'kong':
      return a.tileIds && a.tileIds.length === 4 ? t('action.concealedKong') : a.tileIds ? t('action.addKong') : t('action.kong')
    case 'chow':
      return t('action.chow')
    case 'pass':
      return t('action.pass')
    default:
      return a.type
  }
}

const tileById = (id: number) => props.hand.find((tile) => tile.id === id)

function actionTiles(a: Action): Tile[] {
  if (a.type === 'chow') return a.tileIds.map(tileById).filter((tile): tile is Tile => !!tile)
  if (a.type === 'kong' && a.tileIds) return [tileById(a.tileIds[0]!)].filter((tile): tile is Tile => !!tile)
  return []
}
</script>

<template>
  <div class="actions">
    <button
      v-for="(a, i) in actions"
      :key="`${a.type}-${i}`"
      class="action action--claim"
      :class="[`action--${a.type}`, { 'action--primary': a.type === 'win', 'action--quiet': a.type === 'pass' }]"
      :title="shortcutFor(a) ? t('keys.hint', { key: shortcutFor(a)! }) : undefined"
      @click.stop="emit('act', a)"
    >
      {{ actionLabel(a) }}
      <kbd v-if="shortcutFor(a)">{{ shortcutFor(a) }}</kbd>
      <TileFace v-for="tile in actionTiles(a)" :key="tile.id" :kind="tile.kind" size="xs" />
    </button>
  </div>
</template>
