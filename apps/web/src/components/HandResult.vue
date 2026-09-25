<script setup lang="ts">
import { computed, ref } from 'vue'
import { kindIndex, type HandResult, type PlayerView } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'
import MeldGroup from './MeldGroup.vue'
import ScoreExplain from './ScoreExplain.vue'
import TileFace from './TileFace.vue'

const props = defineProps<{
  result: HandResult
  view: PlayerView
  names: string[]
  avatars: string[]
  matchOver: boolean
  finalScores: number[]
}>()

defineEmits<{ next: []; newMatch: []; explain: [fanId: string] }>()

const { t, fanName } = useI18n()

/** The step-by-step scoring breakdown, opened from the total. */
const explaining = ref(false)

/** How the hand went for you: decides the banner. */
const outcome = computed<'win' | 'loss' | 'draw'>(() => {
  const r = props.result
  if (r.type === 'drawn') return 'draw'
  const mine = r.deltas[props.view.seat]!
  return mine > 0 ? 'win' : mine < 0 ? 'loss' : 'draw'
})

/** One line in the style of "Bot 1 wins 12 fan · you lose 20 (self-draw)". */
const headline = computed(() => {
  const r = props.result
  if (r.type === 'drawn') return t('result.noPoints')
  const me = props.view.seat
  const fan = r.score.total
  const won = r.winner === me ? t('result.youWinFan', { fan }) : t('result.theyWinFan', { name: props.names[r.winner]!, fan })
  const mine = r.deltas[me]!
  const cost = r.winner === me ? t('result.youGain', { n: mine }) : mine < 0 ? t('result.youLose', { n: -mine }) : ''
  return [won, cost].filter(Boolean).join(t('result.sep'))
})

const how = computed(() => {
  const r = props.result
  if (r.type === 'drawn') return ''
  if (r.from === null) return t('result.howSelfDraw', { name: r.winner === props.view.seat ? t('player.you') : props.names[r.winner]! })
  return r.from === props.view.seat ? t('result.howYourDiscard') : t('result.howDiscard', { from: props.names[r.from]! })
})

const winningTiles = computed(() => {
  if (props.view.phase.kind !== 'ended' || !props.view.phase.winningHand) return []
  return [...props.view.phase.winningHand].sort((a, b) => kindIndex(a.kind) - kindIndex(b.kind) || a.id - b.id)
})

const winTileId = computed(() => (props.result.type === 'win' ? props.result.tileId : null))

/** Every seat's change this hand and running total, in seat order. */
const players = computed(() =>
  props.names.map((name, seat) => ({
    name,
    seat,
    avatar: props.avatars[seat]!,
    delta: props.result.type === 'win' ? props.result.deltas[seat]! : 0,
    total: props.finalScores[seat]!,
  })),
)

const standings = computed(() => [...players.value].sort((a, b) => b.total - a.total))

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
</script>

<template>
  <div class="result summary" :class="`summary--${outcome}`" role="dialog" aria-modal="true" aria-labelledby="result-title">
    <div class="result__card summary__card">
      <h2 id="result-title" class="summary__banner">
        <span>{{ t(`result.banner.${outcome}`) }}</span>
      </h2>

      <p class="summary__headline">
        {{ headline }}
        <small v-if="how">{{ how }}</small>
      </p>

      <template v-if="result.type === 'win'">
        <div class="summary__hand">
          <MeldGroup v-for="(m, i) in view.melds[result.winner]" :key="i" :meld="m" />
          <span class="summary__concealed">
            <span v-for="tile in winningTiles" :key="tile.id" class="summary__tile" :class="{ 'is-win': tile.id === winTileId }">
              <span v-if="tile.id === winTileId" class="summary__tag">{{ t('result.winningTile') }}</span>
              <TileFace :kind="tile.kind" pose="stand" :highlight="tile.id === winTileId" />
            </span>
          </span>
        </div>

        <ul class="summary__fans">
          <li v-for="f in result.score.fans" :key="f.id">
            <button class="linklike" :title="t('result.fanHelp')" @click="$emit('explain', f.id)">{{ fanName(f.id) }}</button>
            <span v-if="f.count > 1" class="summary__times">×{{ f.count }}</span>
            <strong>{{ f.points * f.count }}</strong>
          </li>
        </ul>
        <div class="summary__totals">
          <p class="summary__total">
            {{ t('result.totalFan') }} <strong>{{ result.score.total }}</strong>
          </p>
          <button class="summary__how" @click="explaining = true">{{ t('result.howScored') }}</button>
        </div>
      </template>

      <ul class="summary__players">
        <li
          v-for="p in players"
          :key="p.seat"
          :class="{ 'is-me': p.seat === view.seat, 'is-winner': result.type === 'win' && p.seat === result.winner }"
        >
          <span class="summary__face" v-html="p.avatar" />
          <span class="summary__name">{{ p.name }}</span>
          <strong class="summary__delta" :class="{ pos: p.delta > 0, neg: p.delta < 0 }">{{ signed(p.delta) }}</strong>
          <span class="summary__running">{{ t('result.runningTotal', { n: p.total }) }}</span>
        </li>
      </ul>

      <template v-if="matchOver">
        <h3>{{ t('result.finalStandings') }}</h3>
        <ol class="summary__standings">
          <li v-for="s in standings" :key="s.seat" :class="{ 'is-me': s.seat === view.seat }">
            <span>{{ s.name }}</span><strong>{{ s.total }}</strong>
          </li>
        </ol>
        <button class="action action--primary summary__continue" @click="$emit('newMatch')">{{ t('result.newMatch') }}</button>
      </template>
      <button v-else class="action action--primary summary__continue" autofocus @click="$emit('next')">{{ t('result.continue') }}</button>
    </div>

    <ScoreExplain
      v-if="explaining && result.type === 'win'"
      :result="result"
      :rules="view.rules"
      :names="names"
      :seat="view.seat"
      @close="explaining = false"
    />
  </div>
</template>
