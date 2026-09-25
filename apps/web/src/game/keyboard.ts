import type { Action } from '@mahjong/engine'

/** Single-key shortcuts for claim/turn actions. Discards use the hand's own focus + Enter. */
export const SHORTCUTS: Record<string, Action['type']> = {
  w: 'win',
  p: 'pung',
  k: 'kong',
  c: 'chow',
  x: 'pass',
}

export function shortcutFor(action: Action): string | null {
  const entry = Object.entries(SHORTCUTS).find(([, type]) => type === action.type)
  return entry ? entry[0].toUpperCase() : null
}

/**
 * The action a key press selects, or null. Pressing a shortcut twice cycles through options of the
 * same type (e.g. several chows) via `nth`.
 */
export function actionForKey(key: string, actions: readonly Action[], nth = 0): Action | null {
  const type = SHORTCUTS[key.toLowerCase()]
  if (!type) return null
  const options = actions.filter((a) => a.type === type)
  return options.length ? options[nth % options.length]! : null
}

/** What the claim timer does on expiry: pass, and only if passing is legal (V31). */
export function timeoutAction(actions: readonly Action[]): Action | null {
  return actions.find((a) => a.type === 'pass') ?? null
}
