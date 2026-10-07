import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot, type ColyseusTestServer } from '@colyseus/testing'
import type { Room } from '@colyseus/sdk'
import { FEEDBACK_PATH, KICKED_CODE, LEADERBOARD_PATH, ROOM_NAME, SOCIAL_ROOM, type HistoryPage, type MatchDetailReply, type PlayerStats, type FriendsSnapshot, type InviteResult, type Reaction, type Snapshot, type TableInvite, type TableInviteResult } from '@mahjong/protocol'
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

  it('passes a reaction on to everyone else at the table', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'Ann' })
    await next(host)
    const friend = await colyseus.sdk.joinById(host.roomId, { name: 'Bo' })
    await next(friend)
    const echoed: Reaction[] = []
    host.onMessage('reaction', (m: Reaction) => echoed.push(m))
    const seen = new Promise<Reaction>((resolve) => friend.onMessage('reaction', resolve))
    host.send('react', { reaction: 'heart' })
    expect(await seen).toEqual({ from: 0, reaction: 'heart' })
    // A snapshot round trip later, the sender still has seen nothing back.
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

describe('removing players', () => {
  it('closes a removed player\'s connection and keeps them out, by seat and by account', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'Ann' })
    const code = host.roomId
    await next(host)
    const guest = await colyseus.sdk.joinById(code, { name: 'Bo' })
    const token = (await next(guest)).token
    const signedIn = await colyseus.sdk.joinById(code, { name: 'Cy', accessToken: await issuer.token('kick-cy') })
    await next(signedIn)

    const closed = new Promise<number>((resolve) => guest.onLeave((c) => resolve(c)))
    const seatFreed = next(host, (s) => s.players[1]!.name === null)
    host.send('kick', { player: 1 })
    expect(await closed).toBe(KICKED_CODE)
    await seatFreed
    await expect(colyseus.sdk.joinById(code, { name: 'Bo', token })).rejects.toThrow()

    const cyClosed = new Promise<number>((resolve) => signedIn.onLeave((c) => resolve(c)))
    host.send('kick', { player: 2 })
    expect(await cyClosed).toBe(KICKED_CODE)
    // A fresh browser, same account: still out.
    await expect(colyseus.sdk.joinById(code, { name: 'Cy', accessToken: await issuer.token('kick-cy') })).rejects.toThrow()
    // Anyone else may take the seat.
    const di = await colyseus.sdk.joinById(code, { name: 'Di' })
    await next(di)
    await di.leave()
    await host.leave()
  })
})

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

  it('shows friends which table you are at, and lets you invite them to it', async () => {
    const signIn = async (id: string, name: string) => {
      const room = await colyseus.sdk.joinOrCreate(SOCIAL_ROOM, { accessToken: await issuer.token(id), name })
      return { room, first: await nextFriends(room) }
    }
    const inviteResult = (room: Room) => new Promise<TableInviteResult>((resolve) => room.onMessage('tableInviteResult', resolve))
    const dee = await signIn('s-dee', 'Dee')
    const eli = await signIn('s-eli', 'Eli')
    const fay = await signIn('s-fay', 'Fay')
    // Dee and Eli are friends; Fay is a stranger to both.
    const friends = nextFriends(dee.room, (s) => s.friends.some((f) => f.userId === 's-eli' && f.state === 'friend'))
    eli.room.send('acceptInvite', { code: dee.first.me.friendCode })
    await friends

    // Inviting before sitting down anywhere is refused.
    let result = inviteResult(dee.room)
    dee.room.send('tableInvite', { userId: 's-eli', code: 'ZZZZ' })
    expect(await result).toEqual({ ok: false, name: 'Eli', error: 'notAtTable' })

    // Dee sits down: Eli sees the table and its free seats.
    const eliSees = nextFriends(eli.room, (s) => s.friends.some((f) => f.userId === 's-dee' && f.table !== undefined))
    const table = await colyseus.sdk.create(ROOM_NAME, { name: 'Dee', accessToken: await issuer.token('s-dee') })
    await next(table)
    expect((await eliSees).friends.find((f) => f.userId === 's-dee')!.table).toEqual({ code: table.roomId, openSeats: 3, playing: false })
    expect((await nextFriends(dee.room, (s) => s.me.table === table.roomId)).me.table).toBe(table.roomId)

    // Strangers can't be invited, even to a real table.
    result = inviteResult(dee.room)
    dee.room.send('tableInvite', { userId: 's-fay', code: table.roomId })
    expect(await result).toEqual({ ok: false, name: null, error: 'notFriend' })
    // A code the sender is not at is refused.
    result = inviteResult(dee.room)
    dee.room.send('tableInvite', { userId: 's-eli', code: 'ZZZZ' })
    expect((await result).ok).toBe(false)

    // The invite reaches Eli; a second one straight away is too soon.
    const received = new Promise<TableInvite>((resolve) => eli.room.onMessage('tableInvite', resolve))
    result = inviteResult(dee.room)
    dee.room.send('tableInvite', { userId: 's-eli', code: table.roomId })
    expect(await result).toEqual({ ok: true, name: 'Eli' })
    expect(await received).toEqual({ from: { userId: 's-dee', name: 'Dee', avatar: null }, code: table.roomId })
    result = inviteResult(dee.room)
    dee.room.send('tableInvite', { userId: 's-eli', code: table.roomId })
    expect(await result).toEqual({ ok: false, name: 'Eli', error: 'tooSoon' })

    // Dee leaves the table: Eli sees they are no longer at one.
    const gone = nextFriends(eli.room, (s) => s.friends.some((f) => f.userId === 's-dee' && f.table === undefined))
    const deeGone = nextFriends(dee.room, (s) => s.me.table === undefined)
    await table.leave()
    await gone
    await deeGone

    // An offline friend can't be invited.
    const table2 = await colyseus.sdk.create(ROOM_NAME, { name: 'Dee', accessToken: await issuer.token('s-dee') })
    await next(table2)
    await eli.room.leave()
    result = inviteResult(dee.room)
    dee.room.send('tableInvite', { userId: 's-eli', code: table2.roomId })
    expect(await result).toMatchObject({ ok: false, error: 'offline' })
    await table2.leave()
    await fay.room.leave()
    await dee.room.leave()
  })
})

describe('history, stats and rankings', () => {
  it('saves a solo upload once and serves it back as history and stats', async () => {
    const { applyAction, isMatchOver, legalActions, mulberry32, newMatch, nextHand } = await import('@mahjong/engine')
    const { handSummaries } = await import('@mahjong/protocol')
    let match = newMatch(99)
    const rand = mulberry32(99)
    while (!isMatchOver(match)) {
      let state = match.current!
      while (state.phase.kind !== 'ended') {
        const seat = ([0, 1, 2, 3] as const).find((x) => legalActions(state, x).length > 0)!
        const legal = legalActions(state, seat)
        state = applyAction(state, (legal.find((a) => a.type === 'win') ?? legal[Math.floor(rand() * legal.length)])!)
      }
      match = nextHand(match, state.phase.result)
    }
    const upload = { rules: 'mcr', difficulty: 'medium', seed: 99, startedAt: Date.now() - 60_000, endedAt: Date.now(), hands: handSummaries(match), scores: match.scores }

    const me = await colyseus.sdk.joinOrCreate(SOCIAL_ROOM, { accessToken: await issuer.token('h-ann'), name: 'Ann' })
    await nextFriends(me)
    const reply = <T,>(type: string) => new Promise<T>((resolve) => me.onMessage(type, resolve))
    const saved = reply<{ seed: number; ok: boolean }>('soloSaved')
    me.send('soloResult', upload)
    expect(await saved).toEqual({ seed: 99, ok: true })
    const again = reply<{ ok: boolean }>('soloSaved')
    me.send('soloResult', upload)
    expect((await again).ok).toBe(true)
    const bad = reply<{ ok: boolean }>('soloSaved')
    me.send('soloResult', { ...upload, seed: 100, scores: [1, 2, 3, 4] })
    expect((await bad).ok).toBe(false)

    const page = reply<HistoryPage>('historyPage')
    me.send('history', {})
    const { matches } = await page
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ kind: 'solo', difficulty: 'medium', you: 0 })

    const detail = reply<MatchDetailReply>('matchDetail')
    me.send('matchDetail', { id: matches[0]!.id })
    expect((await detail).match!.hands).toHaveLength(16)

    const st = reply<PlayerStats>('stats')
    me.send('stats', {})
    expect((await st).solo).toEqual([expect.objectContaining({ difficulty: 'medium', matches: 1 })])
    await me.leave()
  })

  it('serves the public leaderboard', async () => {
    const res = await colyseus.http.get(`${LEADERBOARD_PATH}?rules=mcr`)
    expect(res.data).toEqual({ entries: expect.any(Array) })
    await expect(colyseus.http.get(`${LEADERBOARD_PATH}?rules=chess`)).rejects.toBeTruthy()
  })
})
