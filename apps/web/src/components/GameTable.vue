<script setup lang="ts">
import { computed } from 'vue'
import { kindIndex, type Action, type PlayerView, type Seat, type Tile } from '@mahjong/engine'
import MeldGroup from './MeldGroup.vue'
import TileFace from './TileFace.vue'

const props = defineProps<{
  view: PlayerView
  actions: Action[]
  names: string[]
}>()

const emit = defineEmits<{ act: [action: Action] }>()

const WIND_NAME = { E: 'East', S: 'South', W: 'West', N: 'North' } as const

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
      return 'Mahjong!'
    case 'pung':
      return 'Pung'
    case 'kong':
      return a.tileIds && a.tileIds.length === 4 ? 'Concealed kong' : a.tileIds ? 'Add to kong' : 'Kong'
    case 'chow':
      return 'Chow'
    case 'pass':
      return 'Pass'
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
  const wind = WIND_NAME[props.view.seatWinds[seat] as keyof typeof WIND_NAME]
  return `${props.names[seat]} · ${wind}${seat === props.view.dealer ? ' · dealer' : ''}`
}

const status = computed(() => {
  const p = phase.value
  const me = props.view.seat
  if (p.kind === 'ended') {
    if (p.result.type === 'drawn') return 'Wall exhausted — drawn hand.'
    return `${props.names[p.result.winner]} wins${p.result.from === null ? ' by self-draw' : ` on ${props.names[p.result.from]}'s discard`}.`
  }
  if (p.kind === 'claim' || p.kind === 'robKong') return p.awaiting ? 'Claim this tile?' : 'Waiting for claims…'
  if (props.view.turn === me) return p.kind === 'discard' ? 'Your turn — pick a tile to discard.' : 'Drawing…'
  return `${props.names[props.view.turn]} to play…`
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
        <span>Prevailing {{ WIND_NAME[view.prevailingWind] }}</span>
        <span>Wall {{ view.wallCount }}</span>
      </div>
      <div class="ponds">
        <div v-for="seat in [positions.top, positions.left, positions.right, view.seat]" :key="seat" class="pond" :class="`pond--${seat === view.seat ? 'me' : seat === positions.top ? 'top' : seat === positions.left ? 'left' : 'right'}`">
          <TileFace v-for="t in view.discards[seat]" :key="t.id" :kind="t.kind" size="sm" :highlight="t.id === lastDiscardId" />
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
          <TileFace v-for="t in actionTiles(a)" :key="t.id" :kind="t.kind" size="sm" />
        </button>
      </div>

      <div class="me__melds">
        <span class="seat__name">{{ seatLabel(view.seat) }}</span>
        <MeldGroup v-for="(m, i) in view.melds[view.seat]" :key="i" :meld="m" />
        <TileFace v-for="f in view.flowers[view.seat]" :key="f.id" :kind="f.kind" size="sm" />
      </div>

      <div class="hand">
        <TileFace
          v-for="t in handTiles.main"
          :key="t.id"
          :kind="t.kind"
          :selectable="discardIds.has(t.id)"
          @select="discard(t)"
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
