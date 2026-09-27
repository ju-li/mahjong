import { randomBytes, randomInt } from 'node:crypto'
import { Room, ServerError, type Client } from '@colyseus/core'
import { newRoomCode, type JoinOptions } from '@mahjong/protocol'
import { friendIds } from './db/friends'
import { services } from './services'
import { AT_KEY, publishRefresh, TABLES_KEY } from './socialBus'
import { Table } from './table'

/** Codes of every table open in this process. */
const liveCodes = new Set<string>()
/** Every open table by code, so a bug report can include the server's full copy of the game. */
const liveTables = new Map<string, Table>()

/** The server's full state of an open table, or null if no table has that code. */
export function tableDiagnostics(code: string): ReturnType<Table['diagnostics']> | null {
  return liveTables.get(code)?.diagnostics() ?? null
}

/** How long a dropped connection may come straight back before its seat is handed to a bot for good. */
const RECONNECT_SECONDS = 20
/** A table stays open this long after its last human leaves, so people can come back to it. */
const EMPTY_TABLE_MS = 30 * 60_000

/**
 * One table, addressed by its four-letter code (the Colyseus room id). All game logic lives in
 * `Table`; this class only moves messages and snapshots between it and the sockets.
 */
export class TableRoom extends Room {
  // The table enforces four humans; the slack lets a player re-enter while their old socket lingers.
  maxClients = 8
  autoDispose = false
  private table!: Table
  private emptyTimer: { clear(): void } | null = null
  /** Seat token per connection, for reconnections. */
  private tokens = new Map<string, string>()
  /** Connections that dropped and may still reconnect. */
  private dropped = new Set<string>()
  /** Verified account per connection, so a reconnection stays signed in. */
  private userIds = new Map<string, string | null>()
  /** What friends last heard about this table: who sits here and its seats, as a comparable key. */
  private published = { users: new Set<string>(), key: '' }
  /** Presence updates run one after another, so they land in order. */
  private presenceQueue: Promise<void> = Promise.resolve()

  onCreate() {
    const code = newRoomCode(liveCodes, (n) => randomInt(n))
    liveCodes.add(code)
    this.roomId = code
    this.table = new Table(
      code,
      {
        setTimeout: (fn, ms) => this.clock.setTimeout(fn, ms),
        now: () => Date.now(),
        random32: () => randomInt(2 ** 32),
        newToken: () => randomBytes(18).toString('base64url'),
      },
      () => this.sendSnapshots(),
    )
    liveTables.set(code, this.table)
    this.onMessage('act', (client, message) => this.table.act(client.sessionId, message))
    this.onMessage('ready', (client) => this.table.readyUp(client.sessionId))
    this.onMessage('unready', (client) => this.table.unready(client.sessionId))
    this.onMessage('deal', (client) => this.table.deal(client.sessionId))
    this.onMessage('profile', (client, message) => this.table.profile(client.sessionId, message))
    this.onMessage('configure', (client, message) => this.table.configure(client.sessionId, message))
    this.onMessage('start', (client) => this.table.start(client.sessionId))
    this.onMessage('restart', (client) => this.table.restart(client.sessionId))
    this.onMessage('rematch', (client) => this.table.rematch(client.sessionId))
    this.onMessage('pause', (client) => this.table.pause(client.sessionId))
    this.onMessage('resume', (client) => this.table.resume(client.sessionId))
    this.onMessage('identify', async (client, message: { accessToken?: unknown } | undefined) => {
      const userId = await services.verify(message?.accessToken)
      this.userIds.set(client.sessionId, userId)
      this.table.identify(client.sessionId, userId)
    })
    this.onMessage('voice', (client, message) => {
      const memo = this.table.voice(client.sessionId, message)
      if (memo) this.broadcast('voice', memo, { except: client })
    })
    this.watchEmpty()
  }

  async onAuth(_client: Client, options: JoinOptions): Promise<{ userId: string | null }> {
    if (!this.table.canJoin(options?.token)) throw new ServerError(4003, 'every seat is taken')
    // A bad or missing token just means a guest: signing in is never needed to play.
    return { userId: await services.verify(options?.accessToken) }
  }

  onJoin(client: Client<{ auth: { userId: string | null } }>, options: JoinOptions) {
    const userId = client.auth?.userId ?? null
    this.userIds.set(client.sessionId, userId)
    const player = this.table.join(client.sessionId, options ?? {}, userId)
    if (player === null) throw new ServerError(4003, 'every seat is taken')
    this.tokens.set(client.sessionId, this.table.snapshotFor(client.sessionId)!.token)
    this.watchEmpty()
  }

  onDrop(client: Client) {
    // A bot covers the seat right away; it stays reserved so the same player can slip back in.
    this.dropped.add(client.sessionId)
    this.table.drop(client.sessionId)
    this.allowReconnection(client, RECONNECT_SECONDS)
    this.watchEmpty()
  }

  onReconnect(client: Client) {
    this.dropped.delete(client.sessionId)
    this.table.join(client.sessionId, { token: this.tokens.get(client.sessionId) }, this.userIds.get(client.sessionId) ?? null)
    this.watchEmpty()
  }

  onLeave(client: Client) {
    // A connection that dropped and never came back keeps its reservation; a chosen leave frees the seat.
    if (!this.dropped.delete(client.sessionId)) this.table.leave(client.sessionId)
    this.tokens.delete(client.sessionId)
    this.userIds.delete(client.sessionId)
    this.watchEmpty()
  }

  onDispose() {
    this.queuePresence(true)
    this.table.dispose()
    liveCodes.delete(this.roomId)
    liveTables.delete(this.roomId)
  }

  private sendSnapshots() {
    for (const client of this.clients) {
      const snap = this.table.snapshotFor(client.sessionId)
      if (snap) client.send('snapshot', snap)
    }
    this.queuePresence(false)
  }

  private queuePresence(closing: boolean) {
    if (!services.db) return
    this.presenceQueue = this.presenceQueue.then(() => this.publishPresence(closing)).catch((error) => console.error('table presence:', error))
  }

  /**
   * Let signed-in players' friends see who sits at this table and whether there is room, and tell
   * them when that changes.
   */
  private async publishPresence(closing: boolean) {
    const db = services.db
    if (!db) return
    const code = this.roomId
    const users = new Set(closing ? [] : this.table.seatedUserIds())
    const info = { openSeats: this.table.openSeats(), playing: this.table.phase === 'playing' }
    const key = closing ? '' : `${[...users].sort().join(',')}|${info.openSeats}|${info.playing}`
    if (key === this.published.key) return
    const before = this.published.users
    this.published = { users, key }
    for (const u of users) await this.presence.hset(AT_KEY, u, code)
    for (const u of before) {
      // Only clear it if they have not sat down somewhere else since.
      if (!users.has(u) && (await this.presence.hget(AT_KEY, u)) === code) await this.presence.hdel(AT_KEY, u)
    }
    if (closing || users.size === 0) await this.presence.hdel(TABLES_KEY, code)
    else await this.presence.hset(TABLES_KEY, code, JSON.stringify(info))
    const affected = new Set([...users, ...before])
    const friends = new Set<string>()
    for (const u of affected) for (const f of await friendIds(db, u)) friends.add(f)
    await publishRefresh(this.presence, ...friends)
  }

  /** Close the table once nobody has been at it for a while. */
  private watchEmpty() {
    if (this.table.hasConnectedHumans()) {
      this.emptyTimer?.clear()
      this.emptyTimer = null
    } else {
      this.emptyTimer ??= this.clock.setTimeout(() => void this.disconnect(), EMPTY_TABLE_MS)
    }
  }
}
