<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { kindIndex, type Action, type PlayerView, type Seat, type Tile, type Wind } from '@mahjong/engine'
import { actionForKey, shortcutFor } from '../game/keyboard'
import { useTileMotion } from '../game/useTileMotion'
import { useI18n } from '../i18n/useI18n'
import MeldGroup from './MeldGroup.vue'
import PlayerBadge from './PlayerBadge.vue'
import TileFace from './TileFace.vue'

const props = defineProps<{
  view: PlayerView
  actions: Action[]
  /** Per seat. */
  names: string[]
  /** Match totals per seat. */
  scores: number[]
  /** Avatar SVG markup per seat. */
  avatars: string[]
  /** e.g. "Hand 3 / 16". */
  handLabel: string
  /** Seconds left to claim, or null when no timer is running. */
  claimRemaining?: number | null
  /** Seat whose player's voice memo is playing. */
  speakingSeat?: number | null
}>()

const emit = defineEmits<{ act: [action: Action]; editProfile: [] }>()

const { t } = useI18n()

const root = ref<HTMLElement | null>(null)
useTileMotion(root)

// ---- Keyboard play (V32) ----
const handEl = ref<HTMLElement | null>(null)
let lastKey = ''
let repeat = 0

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
  if (target?.closest?.('.menu')) return // keys aimed at the settings menu
  if (document.querySelector('[role="dialog"]')) return
  const key = e.key.toLowerCase()
  repeat = key === lastKey ? repeat + 1 : 0
  lastKey = key
  const action = actionForKey(key, props.actions, repeat)
  if (action) {
    e.preventDefault()
    emit('act', action)
    return
  }
  if (key === 'arrowleft' || key === 'arrowright') {
    const tiles = [...(handEl.value?.querySelectorAll<HTMLButtonElement>('button.tile') ?? [])]
    if (tiles.length === 0) return
    e.preventDefault()
    const at = tiles.indexOf(document.activeElement as HTMLButtonElement)
    const next = at < 0 ? (key === 'arrowright' ? 0 : tiles.length - 1) : (at + (key === 'arrowright' ? 1 : -1) + tiles.length) % tiles.length
    tiles[next]!.focus()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
const windName = (w: string) => t(`wind.${w}` as 'wind.E')
const WIND_GLYPH: Record<Wind, string> = { E: '東', S: '南', W: '西', N: '北' }

type Side = 'bottom' | 'right' | 'top' | 'left'

/** Seats by screen side; play passes counter-clockwise, so the next seat sits on the right. */
const sides = computed(() => {
  const me = props.view.seat
  return {
    bottom: me,
    right: ((me + 1) % 4) as Seat,
    top: ((me + 2) % 4) as Seat,
    left: ((me + 3) % 4) as Seat,
  } satisfies Record<Side, Seat>
})
const opponents = computed(() => (['top', 'left', 'right'] as const).map((side) => ({ side, seat: sides.value[side] })))
const SIDE_ORDER: Side[] = ['bottom', 'right', 'top', 'left']

const phase = computed(() => props.view.phase)
const live = computed(() => phase.value.kind !== 'ended')
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

// ---- The wall ----

const WALL_STACKS = 18
const WALL_TILES = WALL_STACKS * 2 * 4

/**
 * Stack heights (0–2) per screen side. Purely decorative: tiles leave the wall starting at the
 * dealer's side and moving round the table, so the wall visibly shrinks as the hand goes on.
 */
const wall = computed(() => {
  const taken = Math.max(0, WALL_TILES - props.view.wallCount)
  const start = SIDE_ORDER.findIndex((s) => sides.value[s] === props.view.dealer)
  const out = {} as Record<Side, number[]>
  SIDE_ORDER.forEach((side, i) => {
    const offset = ((i - start + 4) % 4) * WALL_STACKS * 2
    out[side] = Array.from({ length: WALL_STACKS }, (_, s) => {
      const first = offset + s * 2
      return Math.max(0, Math.min(2, first + 2 - taken))
    })
  })
  return out
})

const seatActive = (seat: Seat) => live.value && props.view.turn === seat
</script>

<template>
  <div ref="root" class="board">
    <div class="board__felt">
      <div class="board__info">
        <span>{{ handLabel }}</span>
        <span>{{ t('table.prevailing', { wind: windName(view.prevailingWind) }) }}</span>
      </div>

      <!-- Opponents -->
      <section
        v-for="o in opponents"
        :key="o.side"
        class="seat"
        :class="`seat--${o.side}`"
        :data-from="`hand-${o.seat}`"
      >
        <PlayerBadge
          :name="names[o.seat]!"
          :wind="WIND_GLYPH[view.seatWinds[o.seat]!]"
          :wind-label="windName(view.seatWinds[o.seat]!)"
          :score="scores[o.seat]!"
          :avatar="avatars[o.seat]!"
          :dealer="o.seat === view.dealer"
          :dealer-label="t('score.dealer')"
          :active="seatActive(o.seat)"
          :speaking="speakingSeat === o.seat"
        />
        <div class="seat__hand" :data-origin="`hand-${o.seat}`">
          <template v-if="o.side === 'top'">
            <TileFace v-for="i in view.concealedCounts[o.seat]" :key="i" back size="sm" pose="stand" />
          </template>
          <template v-else>
            <span v-for="i in view.concealedCounts[o.seat]" :key="i" class="edge" />
          </template>
        </div>
        <div class="seat__melds">
          <MeldGroup v-for="(m, i) in view.melds[o.seat]" :key="i" :meld="m" size="xs" />
          <TileFace v-for="f in view.flowers[o.seat]" :key="f.id" :kind="f.kind" :tile-id="f.id" size="xs" />
        </div>
      </section>

      <!-- Wall, ponds and compass -->
      <section class="middle">
        <div class="middle__table">
          <div v-for="side in SIDE_ORDER" :key="side" class="wall" :class="`wall--${side}`" aria-hidden="true">
            <span v-for="(h, i) in wall[side]" :key="i" class="wall__stack" :class="`wall__stack--${h}`" />
          </div>

          <div class="middle__grid">
            <div
              v-for="side in SIDE_ORDER"
              :key="side"
              class="pond"
              :class="`pond--${side}`"
              :data-from="`hand-${sides[side]}`"
            >
              <TileFace
                v-for="tile in view.discards[sides[side]]"
                :key="tile.id"
                :kind="tile.kind"
                :tile-id="tile.id"
                size="sm"
                :highlight="tile.id === lastDiscardId"
              />
            </div>

            <div class="compass" data-origin="wall">
              <span
                v-for="side in SIDE_ORDER"
                :key="side"
                class="compass__wind"
                :class="[`compass__wind--${side}`, { 'is-active': seatActive(sides[side]) }]"
                :title="windName(view.seatWinds[sides[side]]!)"
              >{{ WIND_GLYPH[view.seatWinds[sides[side]]!] }}</span>
              <span class="compass__core">
                <span v-if="claimRemaining" class="compass__timer" :class="{ 'is-urgent': claimRemaining <= 3 }" :aria-label="t('status.timer', { n: claimRemaining })">{{ claimRemaining }}</span>
                <span v-else class="compass__count" :title="t('table.wall', { n: view.wallCount })">{{ view.wallCount }}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Me -->
      <section class="me" data-from="wall">
        <PlayerBadge
          class="me__badge"
          :name="names[view.seat]!"
          :wind="WIND_GLYPH[view.seatWinds[view.seat]!]"
          :wind-label="windName(view.seatWinds[view.seat]!)"
          :score="scores[view.seat]!"
          :avatar="avatars[view.seat]!"
          :dealer="view.seat === view.dealer"
          :dealer-label="t('score.dealer')"
          :active="seatActive(view.seat)"
          :speaking="speakingSeat === view.seat"
          :edit-label="t('profile.edit')"
          @edit="emit('editProfile')"
        />

        <div class="me__main">
          <p class="status" role="status">{{ status }}</p>

          <div v-if="otherActions.length" class="actions">
            <button
              v-for="(a, i) in otherActions"
              :key="`${a.type}-${i}`"
              class="action action--claim"
              :class="[`action--${a.type}`, { 'action--primary': a.type === 'win', 'action--quiet': a.type === 'pass' }]"
              :title="shortcutFor(a) ? t('keys.hint', { key: shortcutFor(a)! }) : undefined"
              @click="emit('act', a)"
            >
              {{ actionLabel(a) }}
              <kbd v-if="shortcutFor(a)">{{ shortcutFor(a) }}</kbd>
              <TileFace v-for="tile in actionTiles(a)" :key="tile.id" :kind="tile.kind" size="xs" />
            </button>
          </div>

          <div class="me__row">
            <div class="me__melds" :data-from="`hand-${view.seat}`">
              <MeldGroup v-for="(m, i) in view.melds[view.seat]" :key="i" :meld="m" />
              <TileFace v-for="f in view.flowers[view.seat]" :key="f.id" :kind="f.kind" :tile-id="f.id" size="sm" />
            </div>

            <div ref="handEl" class="hand" data-deal :aria-label="t('keys.help')">
              <TileFace
                v-for="tile in handTiles.main"
                :key="tile.id"
                :kind="tile.kind"
                :tile-id="tile.id"
                pose="stand"
                :selectable="discardIds.has(tile.id)"
                @select="discard(tile)"
              />
              <span v-if="handTiles.drawn" class="hand__gap" />
              <TileFace
                v-if="handTiles.drawn"
                :kind="handTiles.drawn.kind"
                :tile-id="handTiles.drawn.id"
                pose="stand"
                :selectable="discardIds.has(handTiles.drawn.id)"
                highlight
                @select="discard(handTiles.drawn)"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
