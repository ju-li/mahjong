import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Pointer travel (px) before a press becomes a drag rather than a tap on a tile. */
const DRAG_SLOP = 6

/**
 * Lets a horizontally scrolling row be panned by dragging with a mouse or pen. Touch screens
 * already pan an `overflow-x: auto` element natively. A press that turns into a drag doesn't
 * also count as a click, so dragging across the hand never discards the tile it started on.
 */
export function useDragScroll(el: Ref<HTMLElement | null>): void {
  let pointerId: number | null = null
  let startX = 0
  let startScroll = 0
  let dragged = false

  function onDown(e: PointerEvent) {
    const node = el.value
    if (!node || e.pointerType === 'touch' || e.button !== 0) return
    if (node.scrollWidth <= node.clientWidth) return
    pointerId = e.pointerId
    startX = e.clientX
    startScroll = node.scrollLeft
    dragged = false
  }

  function onMove(e: PointerEvent) {
    const node = el.value
    if (!node || e.pointerId !== pointerId) return
    const dx = e.clientX - startX
    if (!dragged && Math.abs(dx) < DRAG_SLOP) return
    if (!dragged) {
      dragged = true
      node.setPointerCapture(e.pointerId)
      node.classList.add('is-dragging')
    }
    node.scrollLeft = startScroll - dx
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return
    pointerId = null
    el.value?.classList.remove('is-dragging')
  }

  function onClick(e: MouseEvent) {
    if (!dragged) return
    dragged = false
    e.stopPropagation()
    e.preventDefault()
  }

  onMounted(() => {
    const node = el.value
    if (!node) return
    node.addEventListener('pointerdown', onDown)
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerup', onUp)
    node.addEventListener('pointercancel', onUp)
    node.addEventListener('click', onClick, true)
  })

  onBeforeUnmount(() => {
    const node = el.value
    if (!node) return
    node.removeEventListener('pointerdown', onDown)
    node.removeEventListener('pointermove', onMove)
    node.removeEventListener('pointerup', onUp)
    node.removeEventListener('pointercancel', onUp)
    node.removeEventListener('click', onClick, true)
  })
}
