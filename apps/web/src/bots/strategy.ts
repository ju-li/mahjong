import { mulberry32, type Action } from '@mahjong/engine'
import type { BotRequest } from './protocol'

/**
 * Pick an action for a bot seat. Only `legal` actions are ever returned, and the choice depends
 * only on the request, so the same request always gives the same action.
 *
 * Placeholder strategy: always win when possible, never claim, discard a seeded random tile.
 */
export function chooseAction(req: Pick<BotRequest, 'view' | 'legal' | 'difficulty' | 'seed'>): Action {
  const { legal } = req
  if (legal.length === 0) throw new Error('bot asked to act with no legal actions')
  const win = legal.find((a) => a.type === 'win')
  if (win) return win
  const pass = legal.find((a) => a.type === 'pass')
  if (pass) return pass
  const draw = legal.find((a) => a.type === 'draw')
  if (draw) return draw
  const discards = legal.filter((a) => a.type === 'discard')
  const pool = discards.length > 0 ? discards : legal
  return pool[Math.floor(mulberry32(req.seed)() * pool.length)]!
}
