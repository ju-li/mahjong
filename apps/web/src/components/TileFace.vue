<script setup lang="ts">
import { computed } from 'vue'
import type { TileKind } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'
import { tileSvg } from './tileArt'

const props = defineProps<{
  kind?: TileKind | null
  /** Face-down tile (no kind shown). */
  back?: boolean
  size?: 'xs' | 'sm' | 'md'
  /** `stand`: upright in a hand (back visible above the face). `flat`: lying face up on the table. */
  pose?: 'stand' | 'flat'
  selectable?: boolean
  highlight?: boolean
  /** Physical tile id; lets the table animate the tile as it moves between hand, pond and melds. */
  tileId?: number
}>()

defineEmits<{ select: [] }>()

const art = computed(() => (props.kind && !props.back ? tileSvg(props.kind) : null))

const { t } = useI18n()

const label = computed(() => {
  const k = props.kind
  if (!k || props.back) return t('tile.faceDown')
  switch (k.suit) {
    case 'winds':
      return t('tile.wind', { wind: t(`wind.${k.wind}`) })
    case 'dragons':
      return t(`tile.dragon.${k.dragon}`)
    case 'flowers':
      return k.flower <= 4 ? t('tile.flower', { n: k.flower }) : t('tile.season', { n: k.flower - 4 })
    default:
      return t('tile.suited', { rank: k.rank, suit: t(`tile.${k.suit}`) })
  }
})
</script>

<template>
  <component
    :is="selectable ? 'button' : 'span'"
    class="tile"
    :class="[`tile--${size ?? 'md'}`, `tile--${pose ?? 'flat'}`, art ? 'tile--face' : 'tile--back', { 'tile--selectable': selectable, 'tile--hl': highlight }]"
    :data-tile-id="tileId"
    :aria-label="label"
    :title="label"
    @click="selectable && $emit('select')"
  >
    <span v-if="art" class="tile__art" v-html="art" />
  </component>
</template>
