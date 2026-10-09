<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { kindIndex, type Action, type PlayerView, type Seat, type Tile, type Wind } from '@mahjong/engine'
import { REACTIONS, type ReactionId, type VoiceClip } from '@mahjong/protocol'
import { actionForKey } from '../game/keyboard'
import { REACTION_EMOJI } from '../game/reactions'
import { useSettings } from '../game/settings'
import { useDiscardSpotlight } from '../game/useDiscardSpotlight'
import { useDragScroll } from '../game/useDragScroll'
import { useTileMotion } from '../game/useTileMotion'
import { useI18n } from '../i18n/useI18n'
import ClaimButtons from './ClaimButtons.vue'
import { feltPoint } from './feltPoint'
import MeldGroup from './MeldGroup.vue'
import MenuIcon from './MenuIcon.vue'
import PlayerBadge from './PlayerBadge.vue'
import TableSpotlight from './TableSpotlight.vue'
import TileFace from './TileFace.vue'
import { tileLabel } from './tileLabel'
import VoiceMemoButton from './VoiceMemoButton.vue'

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
  /** Online: opponents' badges open their player card (to add them as a friend). */
  openable?: boolean
  /** Online: your badge opens a menu of emoji reactions, with your profile one more tap away. */
  canReact?: boolean
  /** Online: that menu also has a voice memo button. */
  canVoice?: boolean
  /** Seat whose player's voice memo is playing. */
  speakingSeat?: number | null
  /** Online: emoji reactions floating up from the seat that sent them. */
  reactions?: { id: number; seat: number; reaction: ReactionId; drift: number }[]
}>()

const emit = defineEmits<{ act: [action: Action]; editProfile: []; openPlayer: [seat: Seat]; react: [reaction: ReactionId]; voice: [clip: VoiceClip] }>()

const { t } = useI18n()
const { oneTapDiscard } = useSettings()

const root = ref<HTMLElement | null>(null)
useTileMotion(root)

// ---- Keyboard play (V32) ----
const handEl = ref<HTMLElement | null>(null)
// A hand too wide for the screen scrolls sideways: swipe on touch, drag with a mouse.
useDragScroll(handEl)
let lastKey = ''
let repeat = 0

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && reactMenu.value) {
    closeMenu()
    return
  }
  if (e.key === 'Escape' && pickedId.value !== null) {
    pickedId.value = null
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
  if (target?.closest?.('.topbar')) return // keys aimed at the top bar and its menu
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

// ---- Reactions (online) ----
// The menu and the floating emoji sit over the page, not the felt, which would clip them.

/** Where a seat's face is on screen. */
const faceRect = (seat: number) => root.value?.querySelector(`[data-seat="${seat}"] .badge__photo`)?.getBoundingClientRect() ?? null

/** The open badge menu, placed around your face: emoji above, profile pen below, voice memo to the right. */
const reactMenu = ref<{ x: number; rowX: number; top: number; bottom: number; micX: number; micY: number } | null>(null)
/** Half the emoji row's width, to keep it on screen. */
const ROW_HALF = 135
/** Half the voice memo button's width, to keep it on screen. */
const MIC_HALF = 22
/** A voice memo is being recorded: the menu stays open until it is sent. */
const recording = ref(false)

function onMyBadge() {
  if (!props.canReact && !props.canVoice) return emit('editProfile')
  if (reactMenu.value) return closeMenu()
  const r = faceRect(props.view.seat)
  const badge = root.value?.querySelector('.me__badge')?.getBoundingClientRect()
  if (!r || !badge) return emit('editProfile')
  const x = r.left + r.width / 2
  const rowX = Math.min(Math.max(x, ROW_HALF + 8), window.innerWidth - ROW_HALF - 8)
  const micX = Math.min(badge.right + 10 + MIC_HALF, window.innerWidth - MIC_HALF - 8)
  reactMenu.value = { x, rowX, top: r.top, bottom: badge.bottom, micX, micY: r.top + r.height / 2 }
}

function editProfile() {
  closeMenu()
  emit('editProfile')
}

function closeMenuOutside(e: Event) {
  const target = e.target as HTMLElement | null
  if (target?.closest?.('.react-menu, .me__badge')) return
  closeMenu()
}
function closeMenu() {
  if (!recording.value) reactMenu.value = null
}
// Nothing left in the menu (the host switched both off): close it, even mid-recording.
watch(
  () => !!props.canReact || !!props.canVoice,
  (any) => any || (reactMenu.value = null),
)
watch(reactMenu, (open, was) => {
  if (!!open === !!was) return
  if (open) {
    window.addEventListener('pointerdown', closeMenuOutside, true)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
  } else {
    window.removeEventListener('pointerdown', closeMenuOutside, true)
    window.removeEventListener('resize', closeMenu)
    window.removeEventListener('scroll', closeMenu, true)
  }
})
onBeforeUnmount(() => (reactMenu.value = null))

/** Where each floating emoji started: its sender's face when it arrived. */
const floatStart = ref(new Map<number, { x: number; y: number }>())
watch(
  () => props.reactions ?? [],
  (list) => {
    const next = new Map<number, { x: number; y: number }>()
    for (const r of list) {
      const known = floatStart.value.get(r.id)
      if (known) next.set(r.id, known)
      else {
        const rect = r.seat < 0 ? null : faceRect(r.seat)
        if (rect) next.set(r.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 })
      }
    }
    floatStart.value = next
  },
  { immediate: true, flush: 'post' },
)
const floating = computed(() =>
  (props.reactions ?? []).flatMap((r) => {
    const at = floatStart.value.get(r.id)
    return at ? [{ ...r, ...at, emoji: REACTION_EMOJI[r.reaction] }] : []
  }),
)
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

// The drawn tile sits at the right end; bring it into view when the hand overflows.
watch(drawnId, async (id) => {
  if (id == null) return
  await nextTick()
  const el = handEl.value
  if (el && el.scrollWidth > el.clientWidth) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
})

// ---- Tiles off the ends of a hand too wide for the screen ----

/** How many tiles are (mostly) out of view on each side; each side with any shows an arrow. */
const hiddenTiles = ref({ left: 0, right: 0 })
function measureHand() {
  const el = handEl.value
  if (!el) return
  // Layout positions, not screen ones, so tiles still flying in are counted where they will be.
  const from = el.scrollLeft
  const to = from + el.clientWidth
  let left = 0
  let right = 0
  for (const tile of el.querySelectorAll<HTMLElement>('.tile')) {
    const middle = tile.offsetLeft + tile.offsetWidth / 2
    if (middle < from) left++
    else if (middle > to) right++
  }
  if (left !== hiddenTiles.value.left || right !== hiddenTiles.value.right) hiddenTiles.value = { left, right }
}
function scrollHand(direction: -1 | 1) {
  const el = handEl.value
  el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
}
watch(handTiles, () => nextTick(measureHand), { flush: 'post' })
let handResize: ResizeObserver | undefined
onMounted(() => {
  if (handEl.value && typeof ResizeObserver !== 'undefined') {
    handResize = new ResizeObserver(measureHand)
    handResize.observe(handEl.value)
  }
  measureHand()
})
onBeforeUnmount(() => handResize?.disconnect())

const discardIds = computed(() => new Set(props.actions.flatMap((a) => (a.type === 'discard' ? [a.tileId] : []))))
const otherActions = computed(() => props.actions.filter((a) => a.type !== 'discard' && a.type !== 'draw'))

const tileById = computed(() => new Map(props.view.hand.map((t) => [t.id, t])))

function discard(tile: Tile) {
  const action = props.actions.find((a) => a.type === 'discard' && a.tileId === tile.id)
  if (action) emit('act', action)
}

// ---- Discarding: tap a tile to lift it, tap it again to discard (or once, by setting) ----

const pickedId = ref<number | null>(null)
const pickedTile = computed(() => (pickedId.value === null ? null : (tileById.value.get(pickedId.value) ?? null)))
// The turn moved on (or the tile left the hand): nothing is lifted any more.
watch(discardIds, (ids) => {
  if (pickedId.value !== null && !ids.has(pickedId.value)) pickedId.value = null
})
function tapTile(tile: Tile) {
  if (oneTapDiscard.value || pickedId.value === tile.id) {
    pickedId.value = null
    discard(tile)
  } else {
    pickedId.value = tile.id
  }
}

// ---- Opponents' discards, shown big in the middle of the table ----

const spot = useDiscardSpotlight()
/** The discard this player can claim right now (pung, chow, kong or win, not just pass). */
const claimTileId = computed(() => {
  const p = phase.value
  if (p.kind !== 'claim' && p.kind !== 'robKong') return null
  if (p.from === props.view.seat || !p.awaiting || !otherActions.value.some((a) => a.type !== 'pass')) return null
  return p.tile.id
})
/**
 * Bring a discard to the middle. While the player is studying a pile they opened, only one
 * they can claim interrupts them (the pile shows the others as they land).
 */
function spotlight(tile: Tile, seat: Seat) {
  const held = tile.id === claimTileId.value
  if (pile.value && !held) return
  pile.value = null
  spot.add(tile, seat, held)
}
// A pond that grew got a new discard. A claim shrinks a pond; a new hand empties them all.
watch(
  () => props.view.discards.map((d) => d.length),
  (lengths, before) => {
    if (lengths.every((n) => n === 0)) return spot.reset()
    lengths.forEach((n, seat) => {
      if (seat === props.view.seat || n <= (before[seat] ?? 0)) return
      spotlight(props.view.discards[seat]![n - 1]!, seat as Seat)
    })
  },
)
// A tile added to a kong can be robbed: it comes to the middle too.
watch(
  () => (phase.value.kind === 'robKong' && phase.value.from !== props.view.seat ? phase.value : null),
  (p) => p && spotlight(p.tile, p.from),
)
// A pile opened late, after its discard was skipped, can still be interrupted by a claim.
watch(claimTileId, (id) => {
  const p = phase.value
  if (id !== null && pile.value && (p.kind === 'claim' || p.kind === 'robKong')) spotlight(p.tile, p.from)
})
watch(claimTileId, (id) => spot.hold(id))
onBeforeUnmount(spot.reset)

/** The claim buttons sit with the tile in the middle while it is there. */
const claimInSpotlight = computed(() => spot.entries.value.some((e) => e.held))
/** Read out each discard as it comes in. */
const spotText = computed(() => {
  const last = spot.entries.value[spot.entries.value.length - 1]
  return last ? t('spot.discarded', { name: props.names[last.seat]!, tile: tileLabel(last.tile.kind, t) }) : ''
})

const FLY_MS = 450
const EASE = 'cubic-bezier(.2,.75,.25,1)'
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const fade = (el: HTMLElement, to: 0 | 1, then: () => void) =>
  el.animate([{ opacity: 1 - to }, { opacity: to }], { duration: 200, fill: 'forwards' }).finished.then(then, then)

const feltEl = ref<HTMLElement | null>(null)
/** Where a seat's tiles leave and rejoin its edge of the table: fixed points on the felt, whatever its hand and pond look like. */
const SIDE_POINT: Record<Side, [number, number]> = { left: [0.1, 0.45], right: [0.9, 0.45], top: [0.5, 0.12], bottom: [0.5, 0.88] }
function sidePoint(seat: Seat): { x: number; y: number } | null {
  const side = SIDE_ORDER.find((s) => sides.value[s] === seat)
  return side ? feltPoint(feltEl.value, ...SIDE_POINT[side]) : null
}
/**
 * The move from a card's place in the middle to `point`, shrunk to `scale`. Measured from where
 * the card rests, leaving out any glide of the queue still under way (which the flight is added to).
 */
function towards(item: HTMLElement, point: { x: number; y: number }, scale: number): string {
  const box = item.getBoundingClientRect()
  const gliding = new DOMMatrixReadOnly(getComputedStyle(item).transform)
  const x = box.left + box.width / 2 - gliding.e
  const y = box.top + box.height / 2 - gliding.f
  return `translate(${point.x - x}px, ${point.y - y}px) scale(${scale})`
}

/** In from the discarder's edge of the table to its place in the middle. */
function onSpotEnter(el: Element, done: () => void) {
  const item = el as HTMLElement
  const from = sidePoint(Number(item.dataset.seat) as Seat)
  if (reducedMotion() || !from) return void fade(item, 1, done)
  // Added to any glide of the queue making room, so a card still flying in follows it smoothly.
  item
    .animate([{ transform: towards(item, from, 0.4), opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: FLY_MS, easing: EASE, composite: 'add' })
    .finished.then(done, done)
}

/** Back to the discarder's edge of the table; the tile then fades in on its pond. */
function onSpotLeave(el: Element, done: () => void) {
  const item = el as HTMLElement
  const id = Number(item.dataset.spot)
  const finish = () => {
    spot.landed(id)
    done()
  }
  // Out of the row where it is, so the cards after it glide over at once instead of waiting.
  const { offsetLeft, offsetTop, offsetWidth } = item
  Object.assign(item.style, { position: 'absolute', left: `${offsetLeft}px`, top: `${offsetTop}px`, width: `${offsetWidth}px` })
  item.dataset.leaving = ''
  const to = sidePoint(Number(item.dataset.seat) as Seat)
  if (reducedMotion() || !to) return void fade(item, 0, finish)
  item.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLY_MS, easing: EASE, fill: 'forwards' })
  item
    .animate([{ transform: 'none' }, { transform: towards(item, to, 0.4) }], { duration: FLY_MS, easing: EASE, fill: 'forwards', composite: 'add' })
    .finished.then(finish, finish)
}

// ---- A pond, or your melds, shown big on request ----

type Pile = { kind: 'pond'; seat: Seat } | { kind: 'melds' }
const pile = ref<Pile | null>(null)
let pileOpener: HTMLElement | null = null
function openPile(next: Pile, e: Event) {
  pileOpener = e.currentTarget as HTMLElement
  pile.value = next
}
function closePile() {
  pile.value = null
  pileOpener?.focus({ preventScroll: true })
  pileOpener = null
}
const pileSeat = computed(() => (pile.value?.kind === 'pond' ? pile.value.seat : props.view.seat))
const pileTitle = computed(() => {
  const p = pile.value
  if (!p) return ''
  if (p.kind === 'melds') return t('spot.yourMelds')
  return p.seat === props.view.seat ? t('spot.yourDiscards') : t('spot.discards', { name: props.names[p.seat]! })
})

const status = computed(() => {
  const p = phase.value
  const me = props.view.seat
  if (pickedTile.value && p.kind === 'discard') return t('status.confirmDiscard', { tile: tileLabel(pickedTile.value.kind, t) })
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
    <div ref="feltEl" class="board__felt">
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
          :open-label="openable ? t('friends.viewPlayer', { name: names[o.seat]! }) : undefined"
          :data-seat="o.seat"
          @open="emit('openPlayer', o.seat)"
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
              role="button"
              tabindex="0"
              :aria-label="sides[side] === view.seat ? t('spot.yourDiscards') : t('spot.showDiscards', { name: names[sides[side]]! })"
              @click="openPile({ kind: 'pond', seat: sides[side] }, $event)"
              @keydown.enter.space.prevent="openPile({ kind: 'pond', seat: sides[side] }, $event)"
            >
              <TileFace
                v-for="tile in view.discards[sides[side]]"
                :key="tile.id"
                :class="{ 'is-spotlit': spot.spotlit.value.has(tile.id) }"
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
          :edit-label="canReact ? t('reaction.menu') : canVoice ? t('talk.record') : t('profile.edit')"
          :data-seat="view.seat"
          :aria-expanded="canReact || canVoice ? !!reactMenu : undefined"
          @edit="onMyBadge"
        />

        <div class="me__main">
          <p class="status" role="status">{{ status }}</p>

          <ClaimButtons v-if="otherActions.length && !claimInSpotlight" :actions="otherActions" :hand="view.hand" @act="(a) => emit('act', a)" />

          <div class="me__row">
            <div
              class="me__melds"
              :data-from="`hand-${view.seat}`"
              role="button"
              tabindex="0"
              :aria-label="t('spot.showMelds')"
              @click="openPile({ kind: 'melds' }, $event)"
              @keydown.enter.space.prevent="openPile({ kind: 'melds' }, $event)"
            >
              <MeldGroup v-for="(m, i) in view.melds[view.seat]" :key="i" :meld="m" />
              <TileFace v-for="f in view.flowers[view.seat]" :key="f.id" :kind="f.kind" :tile-id="f.id" size="sm" />
            </div>

            <div class="hand-wrap" :class="{ 'has-left': hiddenTiles.left, 'has-right': hiddenTiles.right }">
              <div ref="handEl" class="hand" data-deal :aria-label="t(oneTapDiscard ? 'keys.help' : 'keys.helpConfirm')" @scroll.passive="measureHand">
                <TileFace
                  v-for="tile in handTiles.main"
                  :key="tile.id"
                  :kind="tile.kind"
                  :tile-id="tile.id"
                  pose="stand"
                  :selectable="discardIds.has(tile.id)"
                  :picked="tile.id === pickedId"
                  @select="tapTile(tile)"
                />
                <span v-if="handTiles.drawn" class="hand__gap" />
                <TileFace
                  v-if="handTiles.drawn"
                  :kind="handTiles.drawn.kind"
                  :tile-id="handTiles.drawn.id"
                  pose="stand"
                  :selectable="discardIds.has(handTiles.drawn.id)"
                  :picked="handTiles.drawn.id === pickedId"
                  highlight
                  @select="tapTile(handTiles.drawn)"
                />
              </div>
              <button v-if="hiddenTiles.left" type="button" class="hand__more hand__more--left" :aria-label="t('hand.moreLeft', { n: hiddenTiles.left })" @click="scrollHand(-1)">
                <span aria-hidden="true">‹</span> {{ hiddenTiles.left }}
              </button>
              <button v-if="hiddenTiles.right" type="button" class="hand__more hand__more--right" :aria-label="t('hand.moreRight', { n: hiddenTiles.right })" @click="scrollHand(1)">
                {{ hiddenTiles.right }} <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <p class="visually-hidden" aria-live="polite">{{ spotText }}</p>

    <TableSpotlight
      v-if="spot.entries.value.length || spot.spotlit.value.size"
      :anchor="feltEl"
      align="first"
      :label="t('spot.label')"
      :catching="spot.entries.value.length > 0"
      @dismiss="spot.dismissAll()"
    >
      <TransitionGroup tag="div" name="spot" class="spot__queue" appear @enter="onSpotEnter" @leave="onSpotLeave">
        <div
          v-for="e in spot.entries.value"
          :key="e.tile.id"
          class="spot__item"
          data-slot
          :data-spot="e.tile.id"
          :data-seat="e.seat"
          @click.stop="spot.dismiss(e.tile.id)"
        >
          <TileFace class="spot__tile" :kind="e.tile.kind" />
          <span class="spot__who"><span class="spot__face" v-html="avatars[e.seat]" /><span class="spot__name">{{ names[e.seat] }}</span></span>
          <ClaimButtons v-if="e.held" :actions="otherActions" :hand="view.hand" @act="(a) => emit('act', a)" />
        </div>
      </TransitionGroup>
    </TableSpotlight>

    <TableSpotlight v-if="pile && !spot.entries.value.length" :anchor="feltEl" :label="pileTitle" @dismiss="closePile">
      <div class="spot__pile">
        <p class="spot__who"><span class="spot__face" v-html="avatars[pileSeat]" />{{ pileTitle }}</p>
        <div v-if="pile.kind === 'pond'" class="spot__tiles">
          <TileFace v-for="tile in view.discards[pile.seat]" :key="tile.id" :kind="tile.kind" :highlight="tile.id === lastDiscardId" />
        </div>
        <div v-else class="spot__melds">
          <MeldGroup v-for="(m, i) in view.melds[view.seat]" :key="i" :meld="m" />
          <TileFace v-for="f in view.flowers[view.seat]" :key="f.id" :kind="f.kind" />
        </div>
        <p v-if="pile.kind === 'pond' && !view.discards[pile.seat]!.length" class="spot__hint">{{ t('spot.none') }}</p>
        <p class="spot__hint">{{ t('spot.close') }}</p>
      </div>
    </TableSpotlight>

    <Teleport to="body">
      <div v-if="reactMenu" class="react-menu" role="group" :aria-label="canReact ? t('reaction.menu') : t('talk.record')">
        <div v-if="canReact" class="react-menu__row" :style="{ left: `${reactMenu.rowX}px`, top: `${reactMenu.top - 10}px` }">
          <button
            v-for="r in REACTIONS"
            :key="r"
            type="button"
            class="react-menu__emoji"
            :aria-label="t(`reaction.${r}`)"
            :title="t(`reaction.${r}`)"
            @click="emit('react', r)"
          >{{ REACTION_EMOJI[r] }}</button>
        </div>
        <button
          type="button"
          class="react-menu__edit"
          :style="{ left: `${reactMenu.x}px`, top: `${reactMenu.bottom + 6}px` }"
          :aria-label="t('profile.edit')"
          :title="t('profile.edit')"
          @click="editProfile"
        ><MenuIcon name="edit" /></button>
        <VoiceMemoButton
          v-if="canVoice"
          class="react-menu__voice"
          :style="{ left: `${reactMenu.micX}px`, top: `${reactMenu.micY}px` }"
          @send="(clip: VoiceClip) => emit('voice', clip)"
          @recording="(on: boolean) => (recording = on)"
        />
      </div>
      <div v-if="floating.length" class="reactions" aria-hidden="true">
        <span
          v-for="r in floating"
          :key="r.id"
          class="reaction-float"
          :style="{ left: `${r.x}px`, top: `${r.y}px`, '--drift': r.drift }"
        >{{ r.emoji }}</span>
      </div>
    </Teleport>
  </div>
</template>
