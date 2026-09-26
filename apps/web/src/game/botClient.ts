import type { Action } from '@mahjong/engine'
import type { BotRequest, BotResponse } from '@mahjong/bots'

/** Promise wrapper around the bot worker. One worker serves every bot seat. */
export class BotClient {
  private worker = new Worker(new URL('../bots/bot.worker.ts', import.meta.url), { type: 'module' })
  private nextId = 1
  private pending = new Map<number, (action: Action) => void>()

  constructor() {
    this.worker.onmessage = (event: MessageEvent<BotResponse>) => {
      const resolve = this.pending.get(event.data.id)
      this.pending.delete(event.data.id)
      resolve?.(event.data.action)
    }
  }

  decide(request: Omit<BotRequest, 'id'>): Promise<Action> {
    const id = this.nextId++
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.worker.postMessage({ ...request, id } satisfies BotRequest)
    })
  }

  dispose(): void {
    this.worker.terminate()
    this.pending.clear()
  }
}
