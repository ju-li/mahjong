import { chooseAction, type BotRequest, type BotResponse } from '@mahjong/bots'

self.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id } = event.data
  const reply: BotResponse = { id, action: chooseAction(event.data) }
  self.postMessage(reply)
}
