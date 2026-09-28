import { Room, ServerError, type Client } from '@colyseus/core'
import {
  DEFAULT_PROFILE_NAME,
  TABLE_INVITE_GAP_MS,
  type Friend,
  type FriendsSnapshot,
  type InviteResult,
  type SocialJoinOptions,
  type TableInvite,
  type TableInviteError,
  type TableInviteResult,
} from '@mahjong/protocol'
import type { Db } from './db/db'
import { acceptInvite, areFriends, ensureProfile, friendIds, getProfile, listFriends, remove, respond, sendRequest, updateProfile } from './db/friends'
import { services } from './services'
import { AT_KEY, ONLINE_KEY, publishRefresh, tableOf, topic, type SocialEvent } from './socialBus'
import { cleanAvatar, cleanName } from './table'

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
  private listeners = new Map<string, (event: unknown) => void>()
  /** When each sender last invited each friend (`sender friend` → ms), for rate limiting. */
  private invitedAt = new Map<string, number>()

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
    this.on('tableInvite', async (db, me, m: { userId?: unknown; code?: unknown }, client) => {
      client.send('tableInviteResult', await this.tableInvite(db, me, String(m?.userId ?? ''), String(m?.code ?? '')))
    })
  }

  /** Ask a friend to the table the sender is seated at, after checking they may. */
  private async tableInvite(db: Db, me: string, friend: string, code: string): Promise<TableInviteResult> {
    // A stranger's name is not the sender's to learn.
    const friendProfile = friend && (await areFriends(db, me, friend)) ? await getProfile(db, friend) : null
    const fail = (error: TableInviteError): TableInviteResult => ({ ok: false, name: friendProfile?.name ?? null, error })
    if (!friendProfile) return fail('notFriend')
    // Only a table the sender really sits at, as the table room recorded it: never the client's word.
    if (!code || (await this.presence.hget(AT_KEY, me)) !== code) return fail('notAtTable')
    if (!(await this.isOnline(friend))) return fail('offline')
    const theirs = await tableOf(this.presence, friend)
    if (theirs?.code === code) return fail('already')
    const mine = await tableOf(this.presence, me)
    if (!mine || mine.openSeats <= 0) return fail('full')
    const key = `${me} ${friend}`
    const now = Date.now()
    if (now - (this.invitedAt.get(key) ?? -Infinity) < TABLE_INVITE_GAP_MS) return fail('tooSoon')
    this.invitedAt.set(key, now)
    for (const [k, at] of this.invitedAt) if (now - at >= TABLE_INVITE_GAP_MS) this.invitedAt.delete(k)
    const sender = await getProfile(db, me)
    if (!sender) return fail('notFriend')
    const invite: TableInvite = { from: { userId: me, name: sender.name, avatar: sender.avatar }, code }
    const event: SocialEvent = { kind: 'invite', invite }
    await this.presence.publish(topic(friend), event)
    return { ok: true, name: friendProfile.name }
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
    await ensureProfile(db, me, { name: cleanName(options?.name, DEFAULT_PROFILE_NAME), avatar: cleanAvatar(options?.avatar, null) })
    let mine = this.members.get(me)
    if (!mine) {
      mine = new Set()
      this.members.set(me, mine)
      const listener = (event: unknown) => {
        const e = event as Partial<SocialEvent> | null
        if (e?.kind === 'invite' && e.invite) {
          for (const c of this.members.get(me) ?? []) c.send('tableInvite', e.invite)
        } else void this.guard(() => this.sendFriends(me))
      }
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
    await publishRefresh(this.presence, ...userIds)
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
      rows.map(async (r) => {
        const online = r.state === 'friend' && (await this.isOnline(r.userId))
        const table = r.state === 'friend' ? await tableOf(this.presence, r.userId) : null
        return table ? { ...r, online, table } : { ...r, online }
      }),
    )
    const me: FriendsSnapshot['me'] = { userId, name: profile.name, avatar: profile.avatar, friendCode: profile.friendCode }
    const table = await this.presence.hget(AT_KEY, userId)
    if (table) me.table = table
    const snapshot: FriendsSnapshot = { me, friends }
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
