import { chooseAction, timeoutAction } from '@mahjong/bots'
import {
  applyAction,
  HANDS_PER_MATCH,
  isMatchOver,
  isRuleSet,
  legalActions,
  newMatch,
  nextHand,
  playerAt,
  sameAction,
  seatOf,
  viewFor,
  type Action,
  type Match,
  type Player,
  type Seat,
} from '@mahjong/engine'
import {
  MAX_NAME_LENGTH,
  ONLINE_CLAIM_SECONDS,
  type MatchInfo,
  type PlayerSlot,
  type Snapshot,
  type TableSettings,
} from '@mahjong/protocol'

const PLAYERS: Player[] = [0, 1, 2, 3]
const SEATS: Seat[] = [0, 1, 2, 3]

/** Same pacing as solo play, so bots feel like they are thinking. */
export const BOT_DELAY_MS = 450
export const QUICK_DELAY_MS = 120
/** A beat after a call, standing in for the spoken callout clients wait for offline. */
export const CALL_PAUSE_MS = 700
/** A human who sits on their turn this long gets a bot move made for them. */
export const TURN_MS = 60_000
/** The next hand deals once everyone is ready, or after this long. */
export const NEXT_HAND_MS = 30_000

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
/** Actions a player calls out loud. */
const CALLS = new Set<Action['type']>(['chow', 'pung', 'kong', 'win'])

/** What the table needs from its host process: timers, the clock and randomness. */
export type TableEnv = {
  setTimeout(fn: () => void, ms: number): { clear(): void }
  now(): number
  /** Uniform 32-bit unsigned integer. */
  random32(): number
  /** Unguessable token for a seat. */
  newToken(): string
}

type Slot = {
  /** Null = no human has this seat (a bot plays it). */
  token: string | null
  name: string
  /** The connection currently holding this seat, if any. */
  client: string | null
}

type Timer = { clear(): void } | null

/** Tidies a player's chosen name: printable, trimmed, bounded. */
export function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const name = raw.replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
  return name || fallback
}

/**
 * One online table: a lobby that turns into a 16-hand match. Holds the only full copy of the game;
 * players receive their own `viewFor` through `snapshotFor`. Transport-free so it can be tested
 * without sockets: `onChange` fires whenever any player's snapshot may differ.
 */
export class Table {
  readonly code: string
  phase: 'lobby' | 'playing' = 'lobby'
  settings: TableSettings = { rules: 'mcr', difficulty: 'medium', claimSeconds: 10 }
  private slots: Slot[] = PLAYERS.map(() => ({ token: null, name: '', client: null }))
  private host: Player = 0
  private match: Match | null = null
  private avatarSeed = 0
  private step = 0
  /** The action applied last, so a call gets its pause. */
  private lastAction: Action | null = null
  private ready = new Set<Player>()
  private botTimer: Timer = null
  private turnTimer: Timer = null
  private nextHandTimer: Timer = null
  /** The claim window the timer belongs to, so bot replies inside it don't restart the clock. */
  private claimKey: string | null = null
  private claimDeadline: number | null = null
  private claimTimer: Timer = null

  constructor(
    code: string,
    private env: TableEnv,
    private onChange: () => void,
  ) {
    this.code = code
  }

  // ---------------------------------------------------------------------------
  // Seats

  /** Players with a human in their seat, connected or not. */
  private humans(): Player[] {
    return PLAYERS.filter((p) => this.slots[p]!.token !== null)
  }

  private connected(p: Player): boolean {
    return this.slots[p]!.client !== null
  }

  playerOf(client: string): Player | null {
    const p = PLAYERS.find((x) => this.slots[x]!.client === client)
    return p ?? null
  }

  /** Whether a join with these options would be let in. */
  canJoin(token: string | undefined): boolean {
    if (token && PLAYERS.some((p) => this.slots[p]!.token === token)) return true
    return this.phase === 'lobby' && this.humans().length < 4
  }

  /** Seat a connection: back in its old seat when the token matches, else the first free one in the lobby. */
  join(client: string, options: { name?: unknown; token?: unknown }): Player | null {
    const token = typeof options.token === 'string' ? options.token : null
    let p = token ? PLAYERS.find((x) => this.slots[x]!.token === token) : undefined
    if (p === undefined) {
      if (this.phase !== 'lobby') return null
      p = PLAYERS.find((x) => this.slots[x]!.token === null)
      if (p === undefined) return null
      this.slots[p] = { token: this.env.newToken(), name: '', client: null }
    }
    const slot = this.slots[p]!
    slot.client = client
    slot.name = cleanName(options.name, slot.name || `Player ${p + 1}`)
    if (!this.connected(this.host) || this.slots[this.host]!.token === null) this.host = p
    this.changed()
    return p
  }

  /**
   * A connection went away. In the lobby its seat is freed; mid-match a bot plays it until the
   * player returns with their token.
   */
  leave(client: string): void {
    const p = this.playerOf(client)
    if (p === null) return
    const slot = this.slots[p]!
    slot.client = null
    if (this.phase === 'lobby') this.slots[p] = { token: null, name: '', client: null }
    this.ready.delete(p)
    if (p === this.host) {
      const next = this.humans().find((x) => this.connected(x))
      if (next !== undefined) this.host = next
    }
    this.changed()
  }

  hasConnectedHumans(): boolean {
    return PLAYERS.some((p) => this.connected(p))
  }

  rename(client: string, name: unknown): void {
    const p = this.playerOf(client)
    if (p === null) return
    this.slots[p]!.name = cleanName(name, this.slots[p]!.name)
    this.changed()
  }

  // ---------------------------------------------------------------------------
  // Lobby

  configure(client: string, update: unknown): void {
    if (this.phase !== 'lobby' || this.playerOf(client) !== this.host || typeof update !== 'object' || !update) return
    const u = update as Partial<Record<keyof TableSettings, unknown>>
    if (isRuleSet(u.rules)) this.settings.rules = u.rules
    if (DIFFICULTIES.includes(u.difficulty as never)) this.settings.difficulty = u.difficulty as TableSettings['difficulty']
    if (ONLINE_CLAIM_SECONDS.includes(u.claimSeconds as never)) this.settings.claimSeconds = u.claimSeconds as TableSettings['claimSeconds']
    this.changed()
  }

  start(client: string): void {
    if (this.phase !== 'lobby' || this.playerOf(client) !== this.host) return
    this.phase = 'playing'
    this.match = newMatch(this.env.random32(), this.settings.rules)
    this.avatarSeed = this.env.random32()
    this.step = 0
    this.lastAction = null
    this.ready.clear()
    this.changed()
  }

  /** Host, once the match is over: everyone still here goes back to the lobby. */
  restart(client: string): void {
    if (this.phase !== 'playing' || this.playerOf(client) !== this.host || !this.finished()) return
    this.stopTimers()
    this.phase = 'lobby'
    this.match = null
    for (const p of PLAYERS) if (!this.connected(p)) this.slots[p] = { token: null, name: '', client: null }
    this.changed()
  }

  /** The match is over, or its last hand has been scored. */
  private finished(): boolean {
    const m = this.match
    if (!m) return false
    return isMatchOver(m) || (m.handIndex === HANDS_PER_MATCH - 1 && m.current?.phase.kind === 'ended')
  }

  // ---------------------------------------------------------------------------
  // Play

  /** A player's move. Ignored unless it quotes the current step and is legal for their own seat. */
  act(client: string, message: unknown): void {
    const p = this.playerOf(client)
    const s = this.match?.current
    if (p === null || !s || typeof message !== 'object' || !message) return
    const { step, action } = message as { step?: unknown; action?: unknown }
    if (step !== this.step) return this.onChange() // stale: resend so the client catches up
    const legal = legalActions(s, seatOf(this.match!, p))
    // Apply our own copy of the matching legal action, never the client's object.
    const chosen = legal.find((a) => {
      try {
        return sameAction(a, action as Action)
      } catch {
        return false
      }
    })
    if (!chosen) return this.onChange()
    this.commit(chosen)
  }

  /** Ready for the next hand. Deals once every connected human is ready. */
  readyUp(client: string): void {
    const p = this.playerOf(client)
    if (p === null || this.match?.current?.phase.kind !== 'ended') return
    this.ready.add(p)
    this.changed()
  }

  private commit(action: Action): void {
    const m = this.match!
    this.match = { ...m, current: applyAction(m.current!, action) }
    this.lastAction = action
    this.step++
    this.changed()
  }

  private stopTimers(): void {
    for (const t of [this.botTimer, this.turnTimer, this.nextHandTimer, this.claimTimer]) t?.clear()
    this.botTimer = this.turnTimer = this.nextHandTimer = this.claimTimer = null
    this.claimKey = this.claimDeadline = null
  }

  /** Something changed: work out what happens next, then tell everyone. */
  private changed(): void {
    this.schedule()
    this.onChange()
  }

  /** The turn loop: `useMatch.pump()` from the solo game, driven by timers instead of a loop. */
  private schedule(): void {
    this.botTimer?.clear()
    this.botTimer = null
    this.turnTimer?.clear()
    this.turnTimer = null
    const m = this.match
    const s = m?.current
    // Nobody watching: hold everything until someone returns.
    if (this.phase !== 'playing' || !m || !s || !this.hasConnectedHumans()) {
      this.stopTimers()
      return
    }

    if (s.phase.kind === 'ended') {
      this.claimTimer?.clear()
      this.claimKey = this.claimDeadline = this.claimTimer = null
      const waiting = this.humans().filter((p) => this.connected(p) && !this.ready.has(p))
      if (waiting.length === 0) {
        this.nextHandTimer?.clear()
        this.nextHandTimer = null
        this.dealNext()
      } else {
        this.nextHandTimer ??= this.env.setTimeout(() => {
          this.nextHandTimer = null
          if (this.match?.current?.phase.kind === 'ended') this.dealNext()
        }, NEXT_HAND_MS)
      }
      return
    }

    const step = this.step
    // Humans at the table: draws happen for them, claims run on the timer, turns on a longer one.
    for (const seat of SEATS) {
      const p = playerAt(m, seat)
      if (!this.connected(p)) continue
      const legal = legalActions(s, seat)
      if (legal.length === 1 && legal[0]!.type === 'draw') {
        this.botTimer = this.env.setTimeout(() => this.stepIs(step) && this.commit(legal[0]!), QUICK_DELAY_MS)
        this.updateClaimTimer()
        return
      }
    }
    this.updateClaimTimer()

    const botSeat = SEATS.find((seat) => !this.connected(playerAt(m, seat)) && legalActions(s, seat).length > 0)
    if (botSeat !== undefined) {
      const legal = legalActions(s, botSeat)
      const quick = legal.every((a) => a.type === 'draw' || a.type === 'pass' || a.type === 'win')
      const called = this.lastAction !== null && CALLS.has(this.lastAction.type)
      const delay = (quick ? QUICK_DELAY_MS : BOT_DELAY_MS) + (called ? CALL_PAUSE_MS : 0)
      this.botTimer = this.env.setTimeout(() => {
        if (!this.stepIs(step)) return
        this.commit(this.botMove(botSeat))
      }, delay)
      return
    }

    // Only connected humans can act. Outside claim windows, don't let one idle player stall the table.
    const turnSeat = SEATS.find((seat) => legalActions(s, seat).length > 0)
    if (turnSeat !== undefined && s.phase.kind !== 'claim' && s.phase.kind !== 'robKong') {
      this.turnTimer = this.env.setTimeout(() => {
        if (this.stepIs(step)) this.commit(this.botMove(turnSeat))
      }, TURN_MS)
    }
  }

  private stepIs(step: number): boolean {
    return this.step === step && this.phase === 'playing'
  }

  private botMove(seat: Seat): Action {
    const s = this.match!.current!
    return chooseAction({
      view: viewFor(s, seat),
      legal: legalActions(s, seat),
      difficulty: this.settings.difficulty,
      seed: (s.seed ^ Math.imul(this.step + 1, 2654435761)) >>> 0,
    })
  }

  /** Starts, keeps or stops the claim countdown for humans who may still answer. */
  private updateClaimTimer(): void {
    const m = this.match!
    const s = m.current!
    const phase = s.phase
    const answering =
      phase.kind === 'claim' || phase.kind === 'robKong'
        ? SEATS.filter((seat) => this.connected(playerAt(m, seat)) && timeoutAction(legalActions(s, seat)))
        : []
    if (answering.length === 0 || (phase.kind !== 'claim' && phase.kind !== 'robKong')) {
      this.claimTimer?.clear()
      this.claimKey = this.claimDeadline = this.claimTimer = null
      return
    }
    const key = `${m.handIndex}:${phase.kind}:${phase.tile.id}`
    if (key === this.claimKey) return
    this.claimTimer?.clear()
    this.claimKey = key
    const ms = this.settings.claimSeconds * 1000
    this.claimDeadline = this.env.now() + ms
    this.claimTimer = this.env.setTimeout(() => this.claimExpired(key), ms)
  }

  /** Time's up: everyone still able to pass does (V31: only ever `pass`, and only when legal). */
  private claimExpired(key: string): void {
    this.claimTimer = null
    if (key !== this.claimKey) return
    const m = this.match
    const s = m?.current
    if (!m || !s) return
    for (const seat of SEATS) {
      const now = this.match!.current!
      const pass = timeoutAction(legalActions(now, seat))
      if (pass && this.connected(playerAt(m, seat))) {
        this.match = { ...this.match!, current: applyAction(now, pass) }
        this.step++
      }
    }
    this.changed()
  }

  private dealNext(): void {
    const m = this.match!
    const s = m.current!
    if (s.phase.kind !== 'ended') return
    this.match = nextHand(m, s.phase.result)
    this.lastAction = null
    this.step++
    this.ready.clear()
    this.claimKey = this.claimDeadline = null
    this.changed()
  }

  // ---------------------------------------------------------------------------
  // What each player sees

  snapshotFor(client: string): Snapshot | null {
    const you = this.playerOf(client)
    if (you === null) return null
    return {
      code: this.code,
      phase: this.phase,
      you,
      token: this.slots[you]!.token!,
      host: this.host,
      players: PLAYERS.map((p): PlayerSlot => {
        const slot = this.slots[p]!
        return { name: slot.token === null ? null : slot.name, connected: slot.client !== null }
      }),
      settings: { ...this.settings },
      match: this.matchInfo(you),
    }
  }

  private matchInfo(you: Player): MatchInfo | null {
    const m = this.match
    if (!m || this.phase !== 'playing') return null
    const s = m.current
    const seat = seatOf(m, you)
    const legal = s ? legalActions(s, seat) : []
    const claiming = this.claimDeadline !== null && legal.some((a) => a.type === 'pass')
    return {
      avatarSeed: this.avatarSeed,
      handIndex: m.handIndex,
      scores: [...m.scores],
      seatPlayers: SEATS.map((x) => playerAt(m, x)),
      over: isMatchOver(m),
      step: this.step,
      view: s ? viewFor(s, seat) : null,
      legal,
      claimMs: claiming ? Math.max(0, this.claimDeadline! - this.env.now()) : null,
      ready: PLAYERS.map((p) => this.ready.has(p)),
    }
  }

  dispose(): void {
    this.stopTimers()
  }
}
