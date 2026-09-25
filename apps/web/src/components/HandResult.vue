<script setup lang="ts">
import { computed } from 'vue'
import { kindIndex, type HandResult, type PlayerView } from '@mahjong/engine'
import MeldGroup from './MeldGroup.vue'
import TileFace from './TileFace.vue'

const props = defineProps<{
  result: HandResult
  view: PlayerView
  names: string[]
  matchOver: boolean
  finalScores: number[]
}>()

defineEmits<{ next: []; newMatch: [] }>()

const title = computed(() => {
  const r = props.result
  if (r.type === 'drawn') return 'Drawn hand'
  const who = r.winner === props.view.seat ? 'You win' : `${props.names[r.winner]} wins`
  return r.from === null ? `${who} by self-draw` : `${who} on ${r.from === props.view.seat ? 'your' : `${props.names[r.from]}'s`} discard`
})

const winningTiles = computed(() => {
  if (props.view.phase.kind !== 'ended' || !props.view.phase.winningHand) return []
  return [...props.view.phase.winningHand].sort((a, b) => kindIndex(a.kind) - kindIndex(b.kind) || a.id - b.id)
})

const winTileId = computed(() => (props.result.type === 'win' ? props.result.tileId : null))

const standings = computed(() =>
  props.names
    .map((name, seat) => ({ name, seat, score: props.finalScores[seat]! }))
    .sort((a, b) => b.score - a.score),
)
</script>

<template>
  <div class="result" role="dialog" aria-modal="true" aria-labelledby="result-title">
    <div class="result__card">
      <h2 id="result-title">{{ title }}</h2>

      <template v-if="result.type === 'win'">
        <div class="result__hand">
          <MeldGroup v-for="(m, i) in view.melds[result.winner]" :key="i" :meld="m" />
          <span class="result__concealed">
            <TileFace v-for="t in winningTiles" :key="t.id" :kind="t.kind" size="sm" :highlight="t.id === winTileId" />
          </span>
        </div>

        <table class="result__fans">
          <tbody>
            <tr v-for="f in result.score.fans" :key="f.id">
              <td>{{ f.name }}<span v-if="f.count > 1"> ×{{ f.count }}</span></td>
              <td class="num">{{ f.points * f.count }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>Total fan</th>
              <th class="num">{{ result.score.total }}</th>
            </tr>
          </tfoot>
        </table>

        <ul class="result__deltas">
          <li v-for="(d, seat) in result.deltas" :key="seat">
            <span>{{ names[seat] }}</span>
            <strong :class="{ pos: d > 0, neg: d < 0 }">{{ d > 0 ? '+' : '' }}{{ d }}</strong>
          </li>
        </ul>
      </template>
      <p v-else class="result__note">The wall ran out. No points change hands.</p>

      <template v-if="matchOver">
        <h3>Final standings</h3>
        <ol class="result__standings">
          <li v-for="s in standings" :key="s.seat" :class="{ 'is-me': s.seat === view.seat }">
            <span>{{ s.name }}</span><strong>{{ s.score }}</strong>
          </li>
        </ol>
        <button class="action action--primary" @click="$emit('newMatch')">New match</button>
      </template>
      <button v-else class="action action--primary" autofocus @click="$emit('next')">Next hand</button>
    </div>
  </div>
</template>
