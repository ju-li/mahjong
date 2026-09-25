import { createWall } from '@mahjong/engine'

export type BotReply = { echo: unknown; wallSize: number }

// Placeholder: echoes the message and proves the engine loads inside the worker.
self.onmessage = (event: MessageEvent<unknown>) => {
  const reply: BotReply = { echo: event.data, wallSize: createWall().length }
  self.postMessage(reply)
}
