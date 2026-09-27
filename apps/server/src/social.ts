import { Room, ServerError, type Client } from '@colyseus/core'
import type { Friend, FriendsSnapshot, InviteResult, SocialJoinOptions } from '@mahjong/protocol'
import type { Db } from './db/db'
import { acceptInvite, ensureProfile, friendIds, getProfile, listFriends, remove, respond, sendRequest, updateProfile } from './db/friends'
import { services } from './services'
import { cleanAvatar, cleanName } from './table'

/** Presence hash: user id → how many social connections they have open (tabs, devices). */
const ONLINE_KEY = 'social:online'
/** Presence channel that tells every connection of one user to refresh their friends list. */
const topic = (userId: string) => `social:user:${userId}`

type SocialClient = Client<{ auth: { userId: string } }>

/**
 * Where signed-in players stay connected while the game is open, at a table or not. It knows who
 * is online (through Colyseus Presence, so it keeps working if rooms ever spread over several
 * processes) and pushes each player a fresh friends list whenever anything in it changes.
 * Guests never join: `onAuth` needs a valid access token.
 */
export class SocialRoom extends Room {
  maxClients = 500
  /** Connections in this room, by user. */
  private members = new Map<string, Set<SocialClient>>()
  /** This room's Presence subscription per user it holds. */
  private listeners = new Map<string, () => void>()

  onCreate() {
    this.on('friendRequest', async (db, me, m: { userId?: unknown }, client) => {
      const other = String(m?.userId ?? '')
      const result = await sendRequest(db, me, other)
      if (!result.ok) client.send('friendError', result.error)
      await this.refresh(me, other)
    })
    this.on('friendRespond', async (db, me, m: { userId?: unknown; accept?: unknown }, client) => {
      const other = String(m?.userId ?? '')
      const result = await respond(db, me, other, m?.accept === true)
      if (!result.ok) client.send('friendError', result.error)
      await this.refresh(me, other)
    })
    this.on('friendRemove', async (db, me, m: { userId?: unknown }) => {
      const other = String(m?.userId ?? '')
      await remove(db, me, other)
      await this.refresh(me, other)
    })
    this.on('acceptInvite', async (db, me, m: { code?: unknown }, client) => {
      const result = await acceptInvite(db, me, String(m?.code ?? ''))
      const reply: InviteResult = result.ok ? { ok: true, name: result.friend.name } : result
      client.send('inviteResult', reply)
      if (result.ok) await this.refresh(me, result.friend.userId)
    })
    this.on('profile', async (db, me, m: { name?: unknown; avatar?: unknown }) => {
      const current = await getProfile(db, me)
      if (!current) return
      await updateProfile(db, me, { name: cleanName(m?.name, current.name), avatar: cleanAvatar(m?.avatar, current.avatar) })
      // Friends see the new name too.
      await this.refresh(me, ...(await friendIds(db, me)))
    })
  }

  /** Handle a message from a signed-in connection, with the database and the sender's verified id. */
  private on<M>(type: string, handler: (db: Db, me: string, message: M, client: SocialClient) => Promise<void>) {
    this.onMessage(type, (client: SocialClient, message: M) => {
      const me = client.auth?.userId
      if (me) void this.guard((db) => handler(db, me, message, client))
    })
  }

  async onAuth(_client: Client, options: SocialJoinOptions): Promise<{ userId: string }> {
    if (!services.db) throw new ServerError(503, 'accounts are off')
    const userId = await services.verify(options?.accessToken)
    if (!userId) throw new ServerError(401, 'sign in first')
    return { userId }
  }

  async onJoin(client: SocialClient, options: SocialJoinOptions) {
    const db = services.db!
    const me = client.auth!.userId
    await ensureProfile(db, me, { name: cleanName(options?.name, 'Player'), avatar: cleanAvatar(options?.avatar, null) })
    let mine = this.members.get(me)
    if (!mine) {
      mine = new Set()
      this.members.set(me, mine)
      const listener = () => void this.guard(() => this.sendFriends(me))
      this.listeners.set(me, listener)
      await this.presence.subscribe(topic(me), listener)
    }
    mine.add(client)
    const open = await this.presence.hincrby(ONLINE_KEY, me, 1)
    await this.sendFriends(me)
    // First connection anywhere: friends' counts go up.
    if (open === 1) await this.refresh(...(await friendIds(db, me)))
  }

  async onLeave(client: SocialClient) {
    const me = client.auth?.userId
    if (!me) return
    const mine = this.members.get(me)
    mine?.delete(client)
    if (mine && mine.size === 0) {
      this.members.delete(me)
      const listener = this.listeners.get(me)
      this.listeners.delete(me)
      if (listener) this.presence.unsubscribe(topic(me), listener)
    }
    const open = await this.presence.hincrby(ONLINE_KEY, me, -1)
    if (open <= 0) {
      await this.presence.hdel(ONLINE_KEY, me)
      if (services.db) await this.guard(async (db) => this.refresh(...(await friendIds(db, me))))
    }
  }

  /** Tell every connection of these users, in any room, to refresh. */
  private async refresh(...userIds: string[]) {
    for (const id of new Set(userIds)) if (id) await this.presence.publish(topic(id), 1)
  }

  private async isOnline(userId: string): Promise<boolean> {
    return Number((await this.presence.hget(ONLINE_KEY, userId)) ?? 0) > 0
  }

  /** Send this user's connections in this room their profile and friends list. */
  private async sendFriends(userId: string) {
    const clients = this.members.get(userId)
    const db = services.db
    if (!clients?.size || !db) return
    const profile = await getProfile(db, userId)
    if (!profile) return
    const rows = await listFriends(db, userId)
    const friends: Friend[] = await Promise.all(
      rows.map(async (r) => ({ ...r, online: r.state === 'friend' && (await this.isOnline(r.userId)) })),
    )
    const snapshot: FriendsSnapshot = { me: { userId, name: profile.name, avatar: profile.avatar, friendCode: profile.friendCode }, friends }
    for (const c of clients) c.send('friends', snapshot)
  }

  /** Run a database task; a failure is logged, never thrown into Colyseus. */
  private async guard(task: (db: Db) => Promise<void>): Promise<void> {
    const db = services.db
    if (!db) return
    try {
      await task(db)
    } catch (error) {
      console.error('social room:', error)
    }
  }
}
