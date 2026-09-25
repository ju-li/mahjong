<script setup lang="ts">
import { computed } from 'vue'
import { HANDS_PER_MATCH, type Match, type Wind } from '@mahjong/engine'

const props = defineProps<{ match: Match; names: string[]; seatWinds: Wind[] | null }>()

const WIND = { E: 'East', S: 'South', W: 'West', N: 'North' } as const

const handLabel = computed(() =>
  props.match.current ? `Hand ${Math.min(props.match.handIndex + 1, HANDS_PER_MATCH)} / ${HANDS_PER_MATCH}` : 'Match finished',
)
const dealer = computed(() => props.match.current?.dealer ?? null)
</script>

<template>
  <section class="scoreboard" aria-label="Scores">
    <span class="scoreboard__hand">{{ handLabel }}</span>
    <ol class="scoreboard__seats">
      <li v-for="(name, seat) in names" :key="seat" :class="{ 'is-me': seat === 0 }">
        <span class="scoreboard__name">
          {{ name }}
          <small v-if="seatWinds">{{ WIND[seatWinds[seat]!] }}<template v-if="seat === dealer"> · dealer</template></small>
        </span>
        <strong :class="{ pos: match.scores[seat]! > 0, neg: match.scores[seat]! < 0 }">{{ match.scores[seat] }}</strong>
      </li>
    </ol>
  </section>
</template>
