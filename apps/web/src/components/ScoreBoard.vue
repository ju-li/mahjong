<script setup lang="ts">
import { computed } from 'vue'
import { HANDS_PER_MATCH, type Match, type Wind } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'

/** `names` and `match.scores` are per player; `seatWinds` is per seat. */
const props = defineProps<{ match: Match; names: string[]; seatWinds: Wind[] | null }>()

const { t } = useI18n()

const handLabel = computed(() =>
  props.match.current
    ? t('score.hand', { n: Math.min(props.match.handIndex + 1, HANDS_PER_MATCH), total: HANDS_PER_MATCH })
    : t('app.matchFinished'),
)
const dealer = computed(() => props.match.current?.dealer ?? null)
const seatOfPlayer = (player: number) => props.match.seating.indexOf(player as 0 | 1 | 2 | 3)
</script>

<template>
  <section class="scoreboard" :aria-label="t('score.scores')">
    <span class="scoreboard__hand">{{ handLabel }}</span>
    <ol class="scoreboard__seats">
      <li v-for="(name, player) in names" :key="player" :class="{ 'is-me': player === 0 }">
        <span class="scoreboard__name">
          {{ name }}
          <small v-if="seatWinds">{{ t(`wind.${seatWinds[seatOfPlayer(player)]!}`) }}<template v-if="seatOfPlayer(player) === dealer"> · {{ t('score.dealer') }}</template></small>
        </span>
        <strong :class="{ pos: match.scores[player]! > 0, neg: match.scores[player]! < 0 }">{{ match.scores[player] }}</strong>
      </li>
    </ol>
  </section>
</template>
