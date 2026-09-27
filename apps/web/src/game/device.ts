/** Phones and small tablets: a touch screen without room for the full table. */
export function isMobile(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (max-width: 1024px)').matches
}
