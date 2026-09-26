import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { ROOM_NAME } from '@mahjong/protocol'
import { TableRoom } from './room'

export const server = defineServer({
  greet: false,
  transport: new WebSocketTransport(),
  rooms: { [ROOM_NAME]: defineRoom(TableRoom) },
  routes: createRouter({
    health: createEndpoint('/health', { method: 'GET' }, async () => ({ ok: true })),
  }),
})

// Railway injects PORT; 2567 is Colyseus' usual port for local development.
if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 2567)
  await server.listen(port)
  console.log(`mahjong server listening on ${port}`)
}
