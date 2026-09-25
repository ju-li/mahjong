<script setup lang="ts">
import { computed } from 'vue'
import type { TileKind } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{
  kind?: TileKind | null
  /** Face-down tile (no kind shown). */
  back?: boolean
  size?: 'sm' | 'md'
  selectable?: boolean
  highlight?: boolean
}>()

defineEmits<{ select: [] }>()

const SUIT_LABEL = { characters: '萬', dots: '筒', bamboo: '條' } as const
const WIND_LABEL = { E: '東', S: '南', W: '西', N: '北' } as const
const FLOWER_LABEL = ['梅', '蘭', '菊', '竹', '春', '夏', '秋', '冬']

const face = computed(() => {
  const k = props.kind
  if (!k || props.back) return null
  switch (k.suit) {
    case 'characters':
    case 'dots':
    case 'bamboo':
      return { main: String(k.rank), sub: SUIT_LABEL[k.suit], tone: k.suit }
    case 'winds':
      return { main: WIND_LABEL[k.wind], sub: k.wind, tone: 'wind' }
    case 'dragons':
      return k.dragon === 'red'
        ? { main: '中', sub: '', tone: 'red' }
        : k.dragon === 'green'
          ? { main: '發', sub: '', tone: 'green' }
          : { main: '', sub: '', tone: 'white' }
    case 'flowers':
      return { main: FLOWER_LABEL[k.flower - 1]!, sub: String(((k.flower - 1) % 4) + 1), tone: 'flower' }
  }
})

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
    :class="[`tile--${size ?? 'md'}`, face ? `tone-${face.tone}` : 'tile--back', { 'tile--selectable': selectable, 'tile--hl': highlight }]"
    :aria-label="label"
    :title="label"
    @click="selectable && $emit('select')"
  >
    <template v-if="face">
      <span class="tile__main">{{ face.main }}</span>
      <span v-if="face.sub" class="tile__sub">{{ face.sub }}</span>
      <span v-if="face.tone === 'white'" class="tile__frame" />
    </template>
  </component>
</template>
