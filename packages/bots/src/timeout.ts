import type { Action } from '@mahjong/engine'

/** What the claim timer does on expiry: pass, and only if passing is legal (V31). */
export function timeoutAction(actions: readonly Action[]): Action | null {
  return actions.find((a) => a.type === 'pass') ?? null
}
