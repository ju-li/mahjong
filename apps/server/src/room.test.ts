import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot, type ColyseusTestServer } from '@colyseus/testing'
import type { Room } from '@colyseus/sdk'
import { ROOM_NAME, type Snapshot } from '@mahjong/protocol'
import { server } from './main'

let colyseus: ColyseusTestServer

beforeAll(async () => {
  colyseus = await boot(server)
})
afterAll(async () => {
  await colyseus.shutdown()
})

/** Resolves with the next snapshot matching `test`. */
function next(room: Room, test: (s: Snapshot) => boolean = () => true): Promise<Snapshot> {
  return new Promise((resolve) => {
    const off = room.onMessage('snapshot', (s: Snapshot) => {
      if (!test(s)) return
      off()
      resolve(s)
    })
  })
}

describe('TableRoom', () => {
  it('hosts under a four-letter code that friends join, then plays with bots in empty seats', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'Ann' })
    expect(host.roomId).toMatch(/^[A-HJ-NP-Z]{4}$/)
    const joined = next(host, (s) => s.players[1]?.name === 'Bo')
    const friend = await colyseus.sdk.joinById(host.roomId, { name: 'Bo' })
    const lobby = await joined
    expect(lobby.phase).toBe('lobby')
    expect(lobby.you).toBe(0)
    expect(lobby.host).toBe(0)

    const started = next(friend, (s) => s.phase === 'playing')
    host.send('start', {})
    const snap = await started
    expect(snap.you).toBe(1)
    expect(snap.players.map((p) => p.name)).toEqual(['Ann', 'Bo', null, null])
    expect(snap.match!.view!.hand.length).toBeGreaterThanOrEqual(13)

    // Friends can hop in mid-match, taking over a bot; a seat's token gets its owner back in.
    const cy = await colyseus.sdk.joinById(host.roomId, { name: 'Cy' })
    expect((await next(cy)).you).toBe(2)
    await cy.leave()
    const token = snap.token
    await friend.leave()
    const back = await colyseus.sdk.joinById(host.roomId, { name: 'Bo', token })
    const again = await next(back)
    expect(again.you).toBe(1)
    expect(again.players[1]).toEqual({ name: 'Bo', connected: true })
    await back.leave()
    await host.leave()
  })

  it('turns away a fifth player', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'A' })
    const others = [await colyseus.sdk.joinById(host.roomId, {}), await colyseus.sdk.joinById(host.roomId, {}), await colyseus.sdk.joinById(host.roomId, {})]
    await expect(colyseus.sdk.joinById(host.roomId, {})).rejects.toThrow()
    for (const r of [host, ...others]) await r.leave()
  })

  it('answers health checks', async () => {
    const res = await colyseus.http.get('/health')
    expect(res.data).toEqual({ ok: true })
  })
})
