<script setup lang="ts">
import { computed } from 'vue'
import type { TileKind } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'
import { tileLabel } from './tileLabel'
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
  /** Lifted out of the hand: the next tap discards it. */
  picked?: boolean
  /** Physical tile id; lets the table animate the tile as it moves between hand, pond and melds. */
  tileId?: number
}>()

defineEmits<{ select: [] }>()

const art = computed(() => (props.kind && !props.back ? tileSvg(props.kind) : null))

const { t } = useI18n()

const label = computed(() => (props.kind && !props.back ? tileLabel(props.kind, t) : t('tile.faceDown')))
</script>

<template>
  <component
    :is="selectable ? 'button' : 'span'"
    class="tile"
    :class="[`tile--${size ?? 'md'}`, `tile--${pose ?? 'flat'}`, art ? 'tile--face' : 'tile--back', { 'tile--selectable': selectable, 'tile--hl': highlight, 'tile--picked': picked }]"
    :data-tile-id="tileId"
    :aria-label="label"
    :title="label"
    @click="selectable && $emit('select')"
  >
    <span v-if="art" class="tile__art" v-html="art" />
  </component>
</template>
