import { randomBytes, randomInt } from 'node:crypto'
import { Room, ServerError, type Client } from '@colyseus/core'
import { newRoomCode, type JoinOptions } from '@mahjong/protocol'
import { Table } from './table'

/** Codes of every table open in this process. */
const liveCodes = new Set<string>()

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
    this.onMessage('act', (client, message) => this.table.act(client.sessionId, message))
    this.onMessage('ready', (client) => this.table.readyUp(client.sessionId))
    this.onMessage('profile', (client, message) => this.table.profile(client.sessionId, message))
    this.onMessage('configure', (client, message) => this.table.configure(client.sessionId, message))
    this.onMessage('start', (client) => this.table.start(client.sessionId))
    this.onMessage('restart', (client) => this.table.restart(client.sessionId))
    this.onMessage('rematch', (client) => this.table.rematch(client.sessionId))
    this.onMessage('pause', (client) => this.table.pause(client.sessionId))
    this.onMessage('resume', (client) => this.table.resume(client.sessionId))
    this.onMessage('voice', (client, message) => {
      const memo = this.table.voice(client.sessionId, message)
      if (memo) this.broadcast('voice', memo, { except: client })
    })
    this.watchEmpty()
  }

  onAuth(_client: Client, options: JoinOptions) {
    if (!this.table.canJoin(options?.token)) throw new ServerError(4003, 'every seat is taken')
    return true
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = this.table.join(client.sessionId, options ?? {})
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
    this.table.join(client.sessionId, { token: this.tokens.get(client.sessionId) })
    this.watchEmpty()
  }

  onLeave(client: Client) {
    // A connection that dropped and never came back keeps its reservation; a chosen leave frees the seat.
    if (!this.dropped.delete(client.sessionId)) this.table.leave(client.sessionId)
    this.tokens.delete(client.sessionId)
    this.watchEmpty()
  }

  onDispose() {
    this.table.dispose()
    liveCodes.delete(this.roomId)
  }

  private sendSnapshots() {
    for (const client of this.clients) {
      const snap = this.table.snapshotFor(client.sessionId)
      if (snap) client.send('snapshot', snap)
    }
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
