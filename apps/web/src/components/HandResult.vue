<script setup lang="ts">
import { computed } from 'vue'
import { kindIndex, type HandResult, type PlayerView } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'
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

const { t, fanName } = useI18n()

const title = computed(() => {
  const r = props.result
  if (r.type === 'drawn') return t('result.drawn')
  const who = r.winner === props.view.seat ? t('result.youWin') : t('result.theyWin', { name: props.names[r.winner]! })
  if (r.from === null) return t('result.bySelfDraw', { who })
  return r.from === props.view.seat ? t('result.onYourDiscard', { who }) : t('result.onDiscard', { who, from: props.names[r.from]! })
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
            <TileFace v-for="tile in winningTiles" :key="tile.id" :kind="tile.kind" size="sm" :highlight="tile.id === winTileId" />
          </span>
        </div>

        <table class="result__fans">
          <tbody>
            <tr v-for="f in result.score.fans" :key="f.id">
              <td>{{ fanName(f.id) }}<span v-if="f.count > 1"> ×{{ f.count }}</span></td>
              <td class="num">{{ f.points * f.count }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>{{ t('result.totalFan') }}</th>
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
      <p v-else class="result__note">{{ t('result.noPoints') }}</p>

      <template v-if="matchOver">
        <h3>{{ t('result.finalStandings') }}</h3>
        <ol class="result__standings">
          <li v-for="s in standings" :key="s.seat" :class="{ 'is-me': s.seat === view.seat }">
            <span>{{ s.name }}</span><strong>{{ s.score }}</strong>
          </li>
        </ol>
        <button class="action action--primary" @click="$emit('newMatch')">{{ t('result.newMatch') }}</button>
      </template>
      <button v-else class="action action--primary" autofocus @click="$emit('next')">{{ t('result.nextHand') }}</button>
    </div>
  </div>
</template>
