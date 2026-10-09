/**
 * A point on the felt, as fractions of its width and height, in screen coordinates.
 * The height used is the felt's minimum height, not its current one: the felt can grow a little
 * as ponds fill up, and points measured from it would creep during a hand.
 */
export function feltPoint(felt: HTMLElement | null, fx: number, fy: number): { x: number; y: number } | null {
  const r = felt?.getBoundingClientRect()
  if (!felt || !r?.width) return null
  const min = parseFloat(getComputedStyle(felt).minHeight)
  const height = min > 0 ? Math.min(min, r.height) : r.height
  return { x: r.left + r.width * fx, y: r.top + height * fy }
}
