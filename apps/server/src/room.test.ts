import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot, type ColyseusTestServer } from '@colyseus/testing'
import type { Room } from '@colyseus/sdk'
import { FEEDBACK_PATH, ROOM_NAME, SOCIAL_ROOM, type FriendsSnapshot, type InviteResult, type Snapshot, type VoiceMemo } from '@mahjong/protocol'
import { tokenVerifier } from './auth'
import type { FeedbackMail } from './feedback'
import { feedbackEnv, server } from './main'
import { services } from './services'
import { testIssuer } from './testAuth'
import { startTestDb } from './db/testDb'

let colyseus: ColyseusTestServer
let stopDb: () => Promise<void>
const issuer = await testIssuer()

beforeAll(async () => {
  const testDb = await startTestDb()
  stopDb = testDb.stop
  services.db = testDb.db
  services.verify = tokenVerifier(issuer.config)
  colyseus = await boot(server)
})
afterAll(async () => {
  await colyseus.shutdown()
  await stopDb()
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
    expect(again.players[1]).toEqual({ name: 'Bo', avatar: null, connected: true, userId: null })
    await back.leave()
    await host.leave()
  })

  it('turns away a fifth player', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'A' })
    const others = [await colyseus.sdk.joinById(host.roomId, {}), await colyseus.sdk.joinById(host.roomId, {}), await colyseus.sdk.joinById(host.roomId, {})]
    await expect(colyseus.sdk.joinById(host.roomId, {})).rejects.toThrow()
    for (const r of [host, ...others]) await r.leave()
  })

  it('passes a voice memo on to everyone else at the table', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'Ann' })
    await next(host)
    const friend = await colyseus.sdk.joinById(host.roomId, { name: 'Bo' })
    await next(friend)
    const echoed: VoiceMemo[] = []
    host.onMessage('voice', (m: VoiceMemo) => echoed.push(m))
    const heard = new Promise<VoiceMemo>((resolve) => friend.onMessage('voice', resolve))
    // Well past the transport's default 4 KB message cap.
    const data = Uint8Array.from({ length: 50_000 }, (_, i) => i % 251)
    host.send('voice', { mime: 'audio/webm;codecs=opus', ms: 3000, data })
    const memo = await heard
    expect(memo.from).toBe(0)
    expect(memo.mime).toBe('audio/webm;codecs=opus')
    expect(new Uint8Array(memo.data)).toEqual(data)
    // A snapshot round trip later, the sender still has heard nothing back.
    const renamed = next(host, (s) => s.players[0]?.name === 'Annie')
    host.send('profile', { name: 'Annie' })
    await renamed
    expect(echoed).toEqual([])
    await friend.leave()
    await host.leave()
  })

  it('answers health checks', async () => {
    const res = await colyseus.http.get('/health')
    expect(res.data).toEqual({ ok: true })
  })

  it("emails feedback with the server's full copy of the player's table", async () => {
    const sent: FeedbackMail[] = []
    feedbackEnv.send = async (mail) => void sent.push(mail)
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'Ann' })
    const started = next(host, (s) => s.phase === 'playing')
    host.send('start', {})
    await started
    const res = await colyseus.http.post(FEEDBACK_PATH, {
      body: { name: 'Ann', email: 'ann@example.com', message: 'Stuck', diagnostics: { userAgent: 'x' }, game: { view: null }, tableCode: host.roomId },
    })
    expect(res.data).toEqual({ ok: true })
    const game = JSON.parse(sent[0]!.attachments[1]!.content)
    expect(game.server.code).toBe(host.roomId)
    expect(game.server.match.current.hands).toHaveLength(4)
    expect(JSON.stringify(game)).not.toContain('token')
    await host.leave()
  })
})

/** Resolves with the next friends list matching `test`. */
function nextFriends(room: Room, test: (s: FriendsSnapshot) => boolean = () => true): Promise<FriendsSnapshot> {
  return new Promise((resolve) => {
    const off = room.onMessage('friends', (s: FriendsSnapshot) => {
      if (!test(s)) return
      off()
      resolve(s)
    })
  })
}

describe('accounts at a table', () => {
  it('shows who is signed in, and a bad token just plays as a guest', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'Ann', accessToken: await issuer.token('user-ann') })
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'Bo', accessToken: 'forged' })
    const both = await next(guest, (s) => s.players[1]?.name === 'Bo')
    expect(both.players.map((p) => p.userId)).toEqual(['user-ann', null, null, null])

    // Signing in while seated.
    const signedIn = next(host, (s) => s.players[1]?.userId === 'user-bo')
    guest.send('identify', { accessToken: await issuer.token('user-bo') })
    await signedIn
    const signedOut = next(host, (s) => s.players[1]?.userId === null)
    guest.send('identify', { accessToken: null })
    await signedOut
    await guest.leave()
    await host.leave()
  })
})

describe('SocialRoom', () => {
  it('turns guests away', async () => {
    await expect(colyseus.sdk.joinOrCreate(SOCIAL_ROOM, {})).rejects.toThrow()
    await expect(colyseus.sdk.joinOrCreate(SOCIAL_ROOM, { accessToken: 'forged' })).rejects.toThrow()
  })

  it('makes friends through an invite link, then by request, and tracks who is online', async () => {
    const ann = await colyseus.sdk.joinOrCreate(SOCIAL_ROOM, { accessToken: await issuer.token('s-ann'), name: 'Ann', avatar: 5 })
    const annFirst = await nextFriends(ann)
    expect(annFirst.me).toMatchObject({ userId: 's-ann', name: 'Ann', avatar: 5 })
    expect(annFirst.friends).toEqual([])

    const bo = await colyseus.sdk.joinOrCreate(SOCIAL_ROOM, { accessToken: await issuer.token('s-bo'), name: 'Bo' })
    await nextFriends(bo)
    const annSeesBo = nextFriends(ann, (s) => s.friends.some((f) => f.userId === 's-bo' && f.online))
    const invited = new Promise<InviteResult>((resolve) => bo.onMessage('inviteResult', resolve))
    bo.send('acceptInvite', { code: annFirst.me.friendCode })
    expect(await invited).toEqual({ ok: true, name: 'Ann' })
    expect((await annSeesBo).friends).toEqual([{ userId: 's-bo', name: 'Bo', avatar: null, state: 'friend', online: true }])

    // Bo leaves: Ann sees them go offline.
    const offline = nextFriends(ann, (s) => s.friends[0]?.online === false)
    await bo.leave()
    await offline

    // A request from a third player shows up as incoming, and accepting it makes them a friend.
    const cy = await colyseus.sdk.joinOrCreate(SOCIAL_ROOM, { accessToken: await issuer.token('s-cy'), name: 'Cy' })
    await nextFriends(cy)
    const incoming = nextFriends(ann, (s) => s.friends.some((f) => f.userId === 's-cy' && f.state === 'incoming'))
    cy.send('friendRequest', { userId: 's-ann' })
    await incoming
    const accepted = nextFriends(cy, (s) => s.friends.some((f) => f.userId === 's-ann' && f.state === 'friend' && f.online))
    ann.send('friendRespond', { userId: 's-cy', accept: true })
    await accepted

    // Renaming reaches friends.
    const renamed = nextFriends(cy, (s) => s.friends.some((f) => f.name === 'Annie'))
    ann.send('profile', { name: 'Annie' })
    await renamed
    await cy.leave()
    await ann.leave()
  })
})
