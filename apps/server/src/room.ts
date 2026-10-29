import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { CloseCode, ErrorCode, Room, ServerError, type Client } from '@colyseus/core'
import { KICKED_CODE, newRoomCode, normalizeCode, REMOVED_CODE, TABLE_FULL_CODE, TABLE_MOVING_CODE, type JoinOptions } from '@mahjong/protocol'
import { friendIds } from './db/friends'
import { claimLiveTable, deleteLiveTable, reserveLiveTable, saveLiveTable, touchLiveTable } from './db/liveTables'
import type { OnlineMatchRecord } from './db/matches'
import { saveMatch } from './matchRecorder'
import { services } from './services'
import { AT_KEY, publishRefresh, TABLES_KEY } from './socialBus'
import { Table, type TableEnv } from './table'

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
export const EMPTY_TABLE_MS = 30 * 60_000

/** This process, as the owner of the tables it saves (see `db/liveTables.ts`). */
const BOOT_ID = randomUUID()
/** Changes reach the database at most this far behind play. */
export const SAVE_MS = 1000
/** An idle table still tells the database its process is alive this often... */
const HEARTBEAT_MS = 5000
/** ...and one silent for this long is presumed dead, so another process may restore it. */
export const STALE_MS = 15_000

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
  /** The table is mirrored to the database (there is one, and it took this table's code). */
  private persisted = false
  /** Changed since it was last saved. */
  private dirty = false
  private lastSaved = 0
  private saving: Promise<void> | null = null
  /** The server is shutting down: the table has been handed on, so nothing at it changes any more. */
  private closing = false

  async onCreate(options?: JoinOptions) {
    const env: TableEnv = {
      setTimeout: (fn, ms) => this.clock.setTimeout(fn, ms),
      now: () => Date.now(),
      random32: () => randomInt(2 ** 32),
      newToken: () => randomBytes(18).toString('base64url'),
      onMatchEnd: (record) => void this.recordMatch(record),
    }
    const onChange = () => {
      this.dirty = true
      this.sendSnapshots()
    }
    const restore = typeof options?.restore === 'string' ? normalizeCode(options.restore) : null
    const table = restore ? await this.restoreTable(restore, env, onChange) : await this.newTable(env, onChange)
    const code = table.code
    this.roomId = code
    this.table = table
    liveTables.set(code, this.table)
    if (this.persisted) this.clock.setInterval(() => void this.save(), SAVE_MS)
    this.onMessage('act', (client, message) => this.table.act(client.sessionId, message))
    this.onMessage('ready', (client) => this.table.readyUp(client.sessionId))
    this.onMessage('unready', (client) => this.table.unready(client.sessionId))
    this.onMessage('deal', (client) => this.table.deal(client.sessionId))
    this.onMessage('profile', (client, message) => this.table.profile(client.sessionId, message))
    this.onMessage('configure', (client, message) => this.table.configure(client.sessionId, message))
    this.onMessage('start', (client) => this.table.start(client.sessionId))
    this.onMessage('restart', (client) => this.table.restart(client.sessionId))
    this.onMessage('rematch', (client, message: { keepScores?: unknown } | undefined) =>
      this.table.rematch(client.sessionId, message?.keepScores === true),
    )
    this.onMessage('pause', (client) => this.table.pause(client.sessionId))
    this.onMessage('resume', (client) => this.table.resume(client.sessionId))
    this.onMessage('identify', async (client, message: { accessToken?: unknown } | undefined) => {
      const userId = await services.verify(message?.accessToken)
      this.userIds.set(client.sessionId, userId)
      this.table.identify(client.sessionId, userId)
    })
    this.onMessage('kick', (client, message: { player?: unknown } | undefined) => {
      const kicked = this.table.kick(client.sessionId, message?.player)
      const target = kicked?.client ? this.clients.find((c) => c.sessionId === kicked.client) : undefined
      if (!target) return
      // Their seat is already gone: this is neither a drop to wait for nor a leave to process.
      this.dropped.delete(target.sessionId)
      this.tokens.delete(target.sessionId)
      target.leave(KICKED_CODE)
    })
    this.onMessage('react', (client, message) => {
      const reaction = this.table.react(client.sessionId, message)
      if (reaction) this.broadcast('reaction', reaction, { except: client })
    })
    this.onMessage('voice', (client, message) => {
      const memo = this.table.voice(client.sessionId, message)
      if (memo) this.broadcast('voice', memo, { except: client })
    })
    this.watchEmpty()
  }

  /** A brand-new table under a code no process is using or keeping for a restart. */
  private async newTable(env: TableEnv, onChange: () => void): Promise<Table> {
    const db = services.db
    for (let attempt = 0; ; attempt++) {
      const code = newRoomCode(liveCodes, (n) => randomInt(n))
      liveCodes.add(code)
      const table = new Table(code, env, onChange)
      if (!db) return table
      try {
        if (await reserveLiveTable(db, code, BOOT_ID, table.save(), EMPTY_TABLE_MS)) {
          this.persisted = true
          return table
        }
      } catch (error) {
        // No database right now: the table plays on, it just won't survive a restart.
        console.error('live table reserve:', error)
        return table
      }
      liveCodes.delete(code)
      if (attempt >= 20) throw new ServerError(ErrorCode.MATCHMAKE_UNHANDLED, 'no free table code')
    }
  }

  /** The table saved under `code` before a restart, taken over from the process that held it. */
  private async restoreTable(code: string, env: TableEnv, onChange: () => void): Promise<Table> {
    const db = services.db
    // Already open here (another player restored it a moment ago): join it instead.
    if (liveCodes.has(code)) throw new ServerError(TABLE_MOVING_CODE, 'table is open')
    if (!db) throw new ServerError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, 'no such table')
    liveCodes.add(code)
    try {
      const claimed = await claimLiveTable(db, code, BOOT_ID, STALE_MS, EMPTY_TABLE_MS)
      if (claimed === 'held') throw new ServerError(TABLE_MOVING_CODE, 'table is moving')
      const table = claimed && Table.restore(code, env, onChange, claimed.state)
      if (!table) {
        if (claimed) await deleteLiveTable(db, code, BOOT_ID)
        throw new ServerError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, 'no such table')
      }
      this.persisted = true
      return table
    } catch (error) {
      liveCodes.delete(code)
      if (error instanceof ServerError) throw error
      console.error('live table restore:', error)
      throw new ServerError(TABLE_MOVING_CODE, 'table unavailable')
    }
  }

  /** Mirror the table to the database if it changed, or say this process still holds it. */
  private save(): Promise<void> {
    const db = services.db
    if (!db || !this.persisted || this.closing || this.saving) return this.saving ?? Promise.resolve()
    const now = Date.now()
    if (!this.dirty && now - this.lastSaved < HEARTBEAT_MS) return Promise.resolve()
    const write = this.dirty ? saveLiveTable(db, this.roomId, BOOT_ID, this.table.save()) : touchLiveTable(db, this.roomId, BOOT_ID)
    this.dirty = false
    this.lastSaved = now
    this.saving = write
      .then((held) => {
        // Another process took the table over; it is theirs to keep now.
        if (!held) this.persisted = false
      })
      .catch((error) => {
        this.dirty = true
        console.error('live table save:', error)
      })
      .finally(() => (this.saving = null))
    return this.saving
  }

  /** The server is going down: hand the table on, then let everyone go, telling them to come back. */
  async onBeforeShutdown() {
    const db = services.db
    if (db && this.persisted && !this.closing) {
      await this.saving
      this.closing = true
      await saveLiveTable(db, this.roomId, BOOT_ID, this.table.save(), true).catch((error) => console.error('live table release:', error))
    }
    this.closing = true
    await this.disconnect(CloseCode.SERVER_SHUTDOWN).catch(() => {})
  }

  async onAuth(_client: Client, options: JoinOptions): Promise<{ userId: string | null }> {
    // A bad or missing token just means a guest: signing in is never needed to play.
    const userId = await services.verify(options?.accessToken)
    if (this.table.isBanned(options?.token, userId)) throw new ServerError(REMOVED_CODE, 'removed by the host')
    if (!this.table.canJoin(options?.token)) throw new ServerError(TABLE_FULL_CODE, 'every seat is taken')
    return { userId }
  }

  onJoin(client: Client<{ auth: { userId: string | null } }>, options: JoinOptions) {
    const userId = client.auth?.userId ?? null
    this.userIds.set(client.sessionId, userId)
    const player = this.table.join(client.sessionId, options ?? {}, userId)
    if (player === null) throw new ServerError(TABLE_FULL_CODE, 'every seat is taken')
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
    // Shutting down: the table was saved with everyone in their seats, and stays that way.
    if (this.closing) return
    // A connection that dropped and never came back keeps its reservation; a chosen leave frees the seat.
    if (!this.dropped.delete(client.sessionId)) this.table.leave(client.sessionId)
    this.tokens.delete(client.sessionId)
    this.userIds.delete(client.sessionId)
    this.watchEmpty()
  }

  onDispose() {
    // `onCreate` failed: there is no table.
    if (!this.table) return
    this.queuePresence(true)
    this.table.dispose()
    liveCodes.delete(this.roomId)
    liveTables.delete(this.roomId)
    // Closed for good, unless it was just handed on to the next process.
    const db = services.db
    if (db && this.persisted && !this.closing) void deleteLiveTable(db, this.roomId, BOOT_ID).catch((error) => console.error('live table delete:', error))
  }

  /** Save a finished match, then tell each rated player at the table their new rating. */
  private async recordMatch(record: OnlineMatchRecord) {
    const changes = await saveMatch(services.db, record)
    if (!changes?.size) return
    for (const client of this.clients) {
      const change = changes.get(this.userIds.get(client.sessionId) ?? '')
      if (change) client.send('rated', change)
    }
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
    // Those who sat down or left hear it too: their own list says which table they are at.
    for (const u of affected) if (users.has(u) !== before.has(u)) friends.add(u)
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
