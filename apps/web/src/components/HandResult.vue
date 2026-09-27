<script setup lang="ts">
import { computed, ref } from 'vue'
import { kindIndex, type HandResult, type PlayerView, type Seat } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'
import MeldGroup from './MeldGroup.vue'
import ScoreExplain from './ScoreExplain.vue'
import TileFace from './TileFace.vue'
import type { ReadyButton } from '../game/source'

const props = defineProps<{
  result: HandResult
  view: PlayerView
  names: string[]
  avatars: string[]
  matchOver: boolean
  finalScores: number[]
  /** Online, between hands: who is ready, in seat order. */
  ready?: boolean[]
  /** Online, between hands: what your button does. Offline it just continues. */
  readyButton?: ReadyButton
}>()

const emit = defineEmits<{ next: []; unready: []; deal: []; newMatch: []; explain: [fanId: string] }>()

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

/** Whose tiles the summary shows: the winner's first (yours on a draw); click a player to switch. */
const shown = ref<Seat>(props.result.type === 'win' ? props.result.winner : props.view.seat)

const shownLabel = computed(() =>
  shown.value === props.view.seat ? t('result.yourHand') : t('result.handOf', { name: props.names[shown.value]! }),
)

const shownTiles = computed(() => {
  const phase = props.view.phase
  if (phase.kind !== 'ended') return []
  return [...phase.hands[shown.value]!].sort((a, b) => kindIndex(a.kind) - kindIndex(b.kind) || a.id - b.id)
})

const winTileId = computed(() => (props.result.type === 'win' && shown.value === props.result.winner ? props.result.tileId : null))

/** Every seat's change this hand and running total, in seat order. */
const players = computed(() =>
  props.names.map((name, seat) => ({
    name,
    seat: seat as Seat,
    avatar: props.avatars[seat]!,
    delta: props.result.type === 'win' ? props.result.deltas[seat]! : 0,
    total: props.finalScores[seat]!,
  })),
)

const standings = computed(() => [...players.value].sort((a, b) => b.total - a.total))

const buttonLabel = computed(() => {
  switch (props.readyButton) {
    case 'ready':
      return t('result.ready')
    case 'notReady':
      return t('result.notReady')
    case 'waiting':
      return t('result.waiting')
    case 'start':
      return t('result.start')
    default:
      return t('result.continue')
  }
})

function press() {
  if (props.readyButton === 'notReady') emit('unready')
  else if (props.readyButton === 'start') emit('deal')
  else emit('next')
}

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

      <p class="summary__whose">{{ shownLabel }}</p>
      <div class="summary__hand">
        <MeldGroup v-for="(m, i) in view.melds[shown]" :key="i" :meld="m" />
        <span class="summary__concealed">
          <span v-for="tile in shownTiles" :key="tile.id" class="summary__tile" :class="{ 'is-win': tile.id === winTileId }">
            <span v-if="tile.id === winTileId" class="summary__tag">{{ t('result.winningTile') }}</span>
            <TileFace :kind="tile.kind" pose="stand" :highlight="tile.id === winTileId" />
          </span>
        </span>
      </div>

      <template v-if="result.type === 'win'">
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
          <button
            class="summary__player"
            :class="{ 'is-shown': p.seat === shown }"
            :aria-pressed="p.seat === shown"
            :title="t('result.showHand', { name: p.name })"
            @click="shown = p.seat"
          >
            <span class="summary__face" v-html="p.avatar" />
            <span class="summary__name">{{ p.name }}</span>
            <strong class="summary__delta" :class="{ pos: p.delta > 0, neg: p.delta < 0 }">{{ signed(p.delta) }}</strong>
            <span class="summary__running">{{ t('result.runningTotal', { n: p.total }) }}</span>
            <span v-if="ready" class="summary__ready" :class="{ 'is-ready': ready[p.seat] }">
              {{ ready[p.seat] ? t('result.status.ready') : t('result.status.notReady') }}
            </span>
          </button>
        </li>
      </ul>

      <template v-if="matchOver">
        <h3>{{ t('result.finalStandings') }}</h3>
        <ol class="summary__standings">
          <li v-for="s in standings" :key="s.seat" :class="{ 'is-me': s.seat === view.seat }">
            <span>{{ s.name }}</span><strong>{{ s.total }}</strong>
          </li>
        </ol>
        <!-- What comes after the match: a new one by default; online tables offer their own choices. -->
        <slot name="matchEnd">
          <button class="action action--primary summary__continue" @click="$emit('newMatch')">{{ t('result.newMatch') }}</button>
        </slot>
      </template>
      <button
        v-else
        class="action action--primary summary__continue"
        :class="{ 'is-quiet': readyButton === 'notReady' || readyButton === 'waiting' }"
        autofocus
        :disabled="readyButton === 'waiting'"
        @click="press"
      >
        {{ buttonLabel }}
      </button>
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
