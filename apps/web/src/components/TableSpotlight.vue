<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'
import { feltPoint } from './feltPoint'

/**
 * Shows its content big in the middle of the table, over everything, without dimming the table:
 * an "invisible modal". A tap anywhere, or Esc, closes it. It is deliberately not a dialog, so
 * the table's claim shortcuts (P, C, X…) keep working while it is up.
 * `anchor` is the felt: the content sits on a fixed point of it (the middle, a little above the
 * centre, where the compass is), so it appears in the same place every time, however full the
 * ponds are. `align: 'first'` keeps the first `[data-slot]` child on that point and lets later
 * ones line up after it (to its right, or below it where the slots are stacked, on a phone), so
 * adding one never moves those already shown.
 * `catching` is whether it takes taps (off while the last tiles fly back, so the table is usable
 * again at once).
 */
const props = withDefaults(defineProps<{ anchor: HTMLElement | null; label: string; catching?: boolean; align?: 'centre' | 'first' }>(), {
  catching: true,
  align: 'centre',
})
const emit = defineEmits<{ dismiss: [] }>()

const MARGIN = 12

/** On the felt when it is on screen, else the middle of the screen. */
function centreNow(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  const w = window.innerWidth
  const h = window.innerHeight
  const at = feltPoint(props.anchor, 0.5, 0.45) ?? { x: w / 2, y: h / 2 }
  return { x: Math.min(Math.max(at.x, 0), w), y: Math.min(Math.max(at.y, 0), h) }
}

// Placed before the first render: the first card's flight in is measured from where it will sit.
const centre = ref(centreNow())
const content = ref<HTMLElement | null>(null)
/**
 * For `align: 'first'`: how far left of and above the centre the content starts. Both come from
 * the first slot's own size, never the content's, which changes as slots leave (they are taken
 * out of the flow while they fly back); with only leaving slots, it stays where it was.
 */
const shift = ref<{ x: number; y: number } | null>(null)

function place() {
  centre.value = centreNow()
  measure()
}

/** The first slot on the centre, unless that would push the row off the screen. */
function measure() {
  const el = content.value
  if (props.align !== 'first' || !el) return
  const first = el.querySelector<HTMLElement>('[data-slot]:not([data-leaving])')
  if (!first?.parentElement) return
  const column = getComputedStyle(first.parentElement).flexDirection === 'column'
  /** Along the row (or column): the first slot on the centre, unless the rest would go off screen. */
  const along = (at: number, slot: number, all: number, screen: number) => {
    const start = Math.max(MARGIN, Math.min(at - slot / 2, screen - MARGIN - all))
    return Math.round(at - start)
  }
  const { x: cx, y: cy } = centre.value
  const x = column ? Math.round(first.offsetWidth / 2) : along(cx, first.offsetWidth, el.offsetWidth, window.innerWidth)
  const y = column ? along(cy, first.offsetHeight, el.offsetHeight, window.innerHeight) : Math.round(first.offsetHeight / 2)
  if (x !== shift.value?.x || y !== shift.value.y) shift.value = { x, y }
}

const transform = computed(() => {
  const s = props.align === 'first' ? shift.value : null
  return s ? `translate(${-s.x}px, ${-s.y}px)` : 'translate(-50%, -50%)'
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.catching) emit('dismiss')
}

// Slots come and go (and start leaving) without this component re-rendering.
let watcher: MutationObserver | undefined
onMounted(() => {
  place()
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
  window.addEventListener('keydown', onKeydown)
  if (content.value && typeof MutationObserver !== 'undefined') {
    watcher = new MutationObserver(measure)
    watcher.observe(content.value, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-leaving'] })
  }
})
onUpdated(measure)
onBeforeUnmount(() => {
  watcher?.disconnect()
  window.removeEventListener('resize', place)
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="spotlight" :class="{ 'is-catching': catching }" @click="catching && emit('dismiss')">
      <div
        ref="content"
        class="spotlight__content"
        :class="{ 'spotlight__content--first': align === 'first' && shift !== null }"
        role="group"
        :aria-label="label"
        :style="{ left: `${centre.x}px`, top: `${centre.y}px`, transform }"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
