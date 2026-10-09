<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Shows its content big in the middle of the table, over everything, without dimming the table:
 * an "invisible modal". A tap anywhere, or Esc, closes it. It is deliberately not a dialog, so
 * the table's claim shortcuts (P, C, X…) keep working while it is up.
 * `anchor` is the element it centres on (the compass); `catching` is whether it takes taps
 * (off while the last tiles fly back, so the table is usable again at once).
 */
const props = withDefaults(defineProps<{ anchor: HTMLElement | null; label: string; catching?: boolean }>(), { catching: true })
const emit = defineEmits<{ dismiss: [] }>()

const centre = ref({ x: 0, y: 0 })

function place() {
  const r = props.anchor?.getBoundingClientRect()
  const w = window.innerWidth
  const h = window.innerHeight
  // On the anchor when it is on screen, else the middle of the screen.
  const x = r && r.width ? r.left + r.width / 2 : w / 2
  const y = r && r.height ? r.top + r.height / 2 : h / 2
  centre.value = { x: Math.min(Math.max(x, 0), w), y: Math.min(Math.max(y, 0), h) }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.catching) emit('dismiss')
}

onMounted(() => {
  place()
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', place)
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="spotlight" :class="{ 'is-catching': catching }" @click="catching && emit('dismiss')">
      <div class="spotlight__content" role="group" :aria-label="label" :style="{ left: `${centre.x}px`, top: `${centre.y}px` }">
        <slot />
      </div>
    </div>
  </Teleport>
</template>
