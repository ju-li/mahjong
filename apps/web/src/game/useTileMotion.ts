import { onBeforeUpdate, onMounted, onUpdated, type Ref } from 'vue'

const MOVE_MS = 340
const DEAL_STAGGER_MS = 28
const EASE = 'cubic-bezier(.2,.75,.25,1)'

/**
 * Animates tiles as they move around the table (FLIP): before each render the position of every
 * `[data-tile-id]` element is recorded; afterwards each tile glides from where it was to where it is.
 * A tile with no previous position (a draw, an opponent's discard) flies in from its origin:
 * the element named by `data-origin` on its nearest `[data-from]` ancestor.
 * On mount, the concealed hand is dealt from the wall with a stagger.
 */
export function useTileMotion(root: Ref<HTMLElement | null>): void {
  let before = new Map<string, DOMRect>()

  const reduced = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function tiles(): HTMLElement[] {
    return [...(root.value?.querySelectorAll<HTMLElement>('[data-tile-id]') ?? [])]
  }

  function originOf(el: HTMLElement): DOMRect | null {
    const from = el.closest<HTMLElement>('[data-from]')?.dataset.from
    const origin = from ? root.value?.querySelector<HTMLElement>(`[data-origin="${from}"]`) : null
    return origin?.getBoundingClientRect() ?? null
  }

  function fly(el: HTMLElement, from: DOMRect, to: DOMRect, opts: { delay?: number; fade?: boolean; centre?: boolean } = {}) {
    // An origin area (a hand, the wall) launches the tile from its centre at the tile's own size.
    const left = opts.centre ? from.left + from.width / 2 - to.width / 2 : from.left
    const top = opts.centre ? from.top + from.height / 2 - to.height / 2 : from.top
    const dx = left - to.left
    const dy = top - to.top
    const sx = opts.centre ? 1 : from.width / to.width
    const sy = opts.centre ? 1 : from.height / to.height
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) return
    for (const a of el.getAnimations()) a.cancel()
    el.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: opts.fade ? 0 : 1 },
        { transformOrigin: '0 0', transform: 'none', opacity: 1 },
      ],
      { duration: MOVE_MS, delay: opts.delay ?? 0, easing: EASE, fill: 'backwards' },
    )
  }

  onBeforeUpdate(() => {
    before = new Map(tiles().map((el) => [el.dataset.tileId!, el.getBoundingClientRect()]))
  })

  onUpdated(() => {
    if (reduced()) return
    for (const el of tiles()) {
      const to = el.getBoundingClientRect()
      const prev = before.get(el.dataset.tileId!)
      if (prev) fly(el, prev, to)
      else {
        const origin = originOf(el)
        if (origin) fly(el, origin, to, { centre: true, fade: true })
      }
    }
  })

  onMounted(() => {
    if (reduced()) return
    tiles()
      .filter((el) => el.closest('[data-deal]'))
      .forEach((el, i) => {
        const origin = originOf(el)
        if (origin) fly(el, origin, el.getBoundingClientRect(), { centre: true, fade: true, delay: i * DEAL_STAGGER_MS })
      })
  })
}
