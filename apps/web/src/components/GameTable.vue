<script setup lang="ts">
import { computed } from 'vue'
import { kindIndex, type Action, type PlayerView, type Seat, type Tile } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'
import MeldGroup from './MeldGroup.vue'
import TileFace from './TileFace.vue'

const props = defineProps<{
  view: PlayerView
  actions: Action[]
  names: string[]
}>()

const emit = defineEmits<{ act: [action: Action] }>()

const { t } = useI18n()
const windName = (w: string) => t(`wind.${w}` as 'wind.E')

/** Opponent seats by screen position; play passes counter-clockwise, so the next seat sits on the right. */
const positions = computed(() => {
  const me = props.view.seat
  return {
    right: ((me + 1) % 4) as Seat,
    top: ((me + 2) % 4) as Seat,
    left: ((me + 3) % 4) as Seat,
  }
})

const phase = computed(() => props.view.phase)
const lastDiscardId = computed(() =>
  phase.value.kind === 'claim' || phase.value.kind === 'robKong' ? phase.value.tile.id : null,
)

const drawnId = computed(() => (phase.value.kind === 'discard' ? phase.value.drawnTileId : null))

/** Sorted concealed hand, with the freshly drawn tile split off to the right. */
const handTiles = computed(() => {
  const sorted = [...props.view.hand].sort((a, b) => kindIndex(a.kind) - kindIndex(b.kind) || a.id - b.id)
  const drawn = sorted.find((t) => t.id === drawnId.value)
  return { main: sorted.filter((t) => t !== drawn), drawn }
})

const discardIds = computed(() => new Set(props.actions.flatMap((a) => (a.type === 'discard' ? [a.tileId] : []))))
const otherActions = computed(() => props.actions.filter((a) => a.type !== 'discard' && a.type !== 'draw'))

const tileById = computed(() => new Map(props.view.hand.map((t) => [t.id, t])))

function discard(tile: Tile) {
  const action = props.actions.find((a) => a.type === 'discard' && a.tileId === tile.id)
  if (action) emit('act', action)
}

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

function actionTiles(a: Action): Tile[] {
  if (a.type === 'chow') return a.tileIds.map((id) => tileById.value.get(id)!).filter(Boolean)
  if (a.type === 'kong' && a.tileIds) return [tileById.value.get(a.tileIds[0]!)!].filter(Boolean)
  return []
}

function seatLabel(seat: Seat): string {
  const params = { name: props.names[seat]!, wind: windName(props.view.seatWinds[seat]!) }
  return seat === props.view.dealer ? t('table.seatDealer', params) : t('table.seat', params)
}

const status = computed(() => {
  const p = phase.value
  const me = props.view.seat
  if (p.kind === 'ended') {
    if (p.result.type === 'drawn') return t('status.drawn')
    const name = props.names[p.result.winner]!
    return p.result.from === null ? t('status.winSelf', { name }) : t('status.winDiscard', { name, from: props.names[p.result.from]! })
  }
  if (p.kind === 'claim' || p.kind === 'robKong') return p.awaiting ? t('status.claim') : t('status.waitingClaims')
  if (props.view.turn === me) return p.kind === 'discard' ? t('status.yourDiscard') : t('status.drawing')
  return t('status.toPlay', { name: props.names[props.view.turn]! })
})
</script>

<template>
  <div class="table">
    <section
      v-for="(seat, pos) in positions"
      :key="pos"
      class="seat"
      :class="[`seat--${pos}`, { 'seat--active': view.turn === seat && phase.kind !== 'ended' }]"
    >
      <header class="seat__name">{{ seatLabel(seat) }}</header>
      <div class="seat__hand">
        <TileFace v-for="i in view.concealedCounts[seat]" :key="i" back size="sm" />
      </div>
      <div class="seat__melds">
        <MeldGroup v-for="(m, i) in view.melds[seat]" :key="i" :meld="m" />
        <TileFace v-for="f in view.flowers[seat]" :key="f.id" :kind="f.kind" size="sm" />
      </div>
    </section>

    <section class="center">
      <div class="center__info">
        <span>{{ t('table.prevailing', { wind: windName(view.prevailingWind) }) }}</span>
        <span>{{ t('table.wall', { n: view.wallCount }) }}</span>
      </div>
      <div class="ponds">
        <div v-for="seat in [positions.top, positions.left, positions.right, view.seat]" :key="seat" class="pond" :class="`pond--${seat === view.seat ? 'me' : seat === positions.top ? 'top' : seat === positions.left ? 'left' : 'right'}`">
          <TileFace v-for="tile in view.discards[seat]" :key="tile.id" :kind="tile.kind" size="sm" :highlight="tile.id === lastDiscardId" />
        </div>
      </div>
    </section>

    <section class="me" :class="{ 'seat--active': view.turn === view.seat && phase.kind !== 'ended' }">
      <p class="status" role="status">{{ status }}</p>

      <div v-if="otherActions.length" class="actions">
        <button
          v-for="(a, i) in otherActions"
          :key="i"
          class="action"
          :class="{ 'action--primary': a.type === 'win', 'action--quiet': a.type === 'pass' }"
          @click="emit('act', a)"
        >
          {{ actionLabel(a) }}
          <TileFace v-for="tile in actionTiles(a)" :key="tile.id" :kind="tile.kind" size="sm" />
        </button>
      </div>

      <div class="me__melds">
        <span class="seat__name">{{ seatLabel(view.seat) }}</span>
        <MeldGroup v-for="(m, i) in view.melds[view.seat]" :key="i" :meld="m" />
        <TileFace v-for="f in view.flowers[view.seat]" :key="f.id" :kind="f.kind" size="sm" />
      </div>

      <div class="hand">
        <TileFace
          v-for="tile in handTiles.main"
          :key="tile.id"
          :kind="tile.kind"
          :selectable="discardIds.has(tile.id)"
          @select="discard(tile)"
        />
        <span v-if="handTiles.drawn" class="hand__gap" />
        <TileFace
          v-if="handTiles.drawn"
          :kind="handTiles.drawn.kind"
          :selectable="discardIds.has(handTiles.drawn.id)"
          highlight
          @select="discard(handTiles.drawn)"
        />
      </div>
    </section>
  </div>
</template>
