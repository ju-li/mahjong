import type { BotRequest, BotResponse } from './protocol'
import { chooseAction } from './strategy'

self.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id } = event.data
  const reply: BotResponse = { id, action: chooseAction(event.data) }
  self.postMessage(reply)
}
