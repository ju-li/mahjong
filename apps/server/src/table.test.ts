import { describe, expect, it } from 'vitest'
import { chooseAction } from '@mahjong/bots'
import { seatOf, type GameState, type Match, type Player } from '@mahjong/engine'
import type { Snapshot } from '@mahjong/protocol'
import { cleanName, Table, TURN_MS, type TableEnv } from './table'

/** Timers that only fire when the test moves the clock. */
class FakeEnv implements TableEnv {
  time = 0
  private seq = 0
  private timers: { at: number; seq: number; fn: () => void; live: boolean }[] = []
  private counter = 1

  setTimeout(fn: () => void, ms: number) {
    const timer = { at: this.time + ms, seq: this.seq++, fn, live: true }
    this.timers.push(timer)
    return { clear: () => void (timer.live = false) }
  }
  now() {
    return this.time
  }
  random32() {
    return (this.counter++ * 2654435761) >>> 0
  }
  newToken() {
    return `token-${this.counter++}`
  }
  /** Run every timer due within `ms`, in order. */
  advance(ms: number) {
    const end = this.time + ms
    for (;;) {
      this.timers = this.timers.filter((t) => t.live)
      const next = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
      if (!next) break
      this.time = next.at
      next.live = false
      next.fn()
    }
    this.time = end
  }
}

type Internals = { match: Match | null }
const state = (t: Table): GameState | null => (t as unknown as Internals).match?.current ?? null
const matchOf = (t: Table): Match => (t as unknown as Internals).match!

/** A table plus a log of every snapshot each client would have been sent. */
function setup(names: string[]) {
  const env = new FakeEnv()
  const sent: { client: string; snap: Snapshot }[] = []
  let table!: Table
  const clients = names.map((_, i) => `c${i}`)
  table = new Table('ABCD', env, () => {
    for (const c of clients) {
      const snap = table.snapshotFor(c)
      if (snap) sent.push({ client: c, snap: JSON.parse(JSON.stringify(snap)) as Snapshot })
    }
    // V16: nothing another seat holds concealed ever reaches a client.
    const s = state(table)
    if (!s) return
    for (const c of clients) {
      const p = table.playerOf(c)
      if (p === null) continue
      const json = JSON.stringify(table.snapshotFor(c))
      const mine = seatOf(matchOf(table), p)
      const winner = s.phase.kind === 'ended' && s.phase.result.type === 'win' ? s.phase.result.winner : null
      s.hands.forEach((hand, seat) => {
        if (seat === mine || seat === winner) return
        for (const tile of hand) expect(json).not.toMatch(new RegExp(`"id":${tile.id}[,}]`))
      })
      expect(json).not.toContain(`${matchOf(table).seed}`)
    }
  })
  names.forEach((name, i) => table.join(clients[i]!, { name }))
  const snap = (c: string) => table.snapshotFor(c)!
  return { env, table, clients, sent, snap }
}

/** Every connected client plays like a bot and readies up between hands. */
function autoplay(table: Table, clients: string[], snap: (c: string) => Snapshot) {
  for (const c of clients) {
    const m = snap(c)?.match
    if (!m?.view) continue
    if (m.view.phase.kind === 'ended') {
      if (!m.ready[snap(c).you]) table.readyUp(c)
    } else if (m.legal.length > 0) {
      table.act(c, { step: m.step, action: chooseAction({ view: m.view, legal: m.legal, difficulty: 'easy', seed: m.step }) })
    }
  }
}

describe('cleanName', () => {
  it('trims, strips control characters and bounds the length', () => {
    expect(cleanName('  Ann\u0000ie  ', 'x')).toBe('Annie')
    expect(cleanName('a'.repeat(40), 'x')).toHaveLength(16)
    expect(cleanName('   ', 'Player 2')).toBe('Player 2')
    expect(cleanName(42, 'Player 2')).toBe('Player 2')
  })
})

describe('lobby', () => {
  it('seats up to four, makes the first the host and hands hosting on', () => {
    const { table, snap } = setup(['Ann', 'Bo', 'Cy', 'Di'])
    expect(snap('c0').host).toBe(0)
    expect(snap('c2').players.map((p) => p.name)).toEqual(['Ann', 'Bo', 'Cy', 'Di'])
    expect(table.canJoin(undefined)).toBe(false)
    expect(table.join('c4', { name: 'Ed' })).toBeNull()
    table.leave('c0')
    expect(snap('c1').host).toBe(1)
    expect(snap('c1').players[0]!.name).toBeNull() // seat freed in the lobby
    expect(table.canJoin(undefined)).toBe(true)
  })

  it('only the host configures and starts', () => {
    const { table, snap } = setup(['Ann', 'Bo'])
    table.configure('c1', { rules: 'hk' })
    table.start('c1')
    expect(snap('c0').settings.rules).toBe('mcr')
    expect(snap('c0').phase).toBe('lobby')
    table.configure('c0', { rules: 'hk', difficulty: 'hard', claimSeconds: 5 })
    table.configure('c0', { rules: 'riichi', claimSeconds: 0 }) // not offered: ignored
    expect(snap('c1').settings).toEqual({ rules: 'hk', difficulty: 'hard', claimSeconds: 5 })
    table.start('c0')
    expect(snap('c1').phase).toBe('playing')
    expect(table.canJoin(undefined)).toBe(false) // strangers can't join a match under way
  })
})

describe('play', () => {
  it('fills empty seats with bots that play on their own', () => {
    const { env, table, snap } = setup(['Ann', 'Bo'])
    table.start('c0')
    expect(snap('c0').players.map((p) => p.name)).toEqual(['Ann', 'Bo', null, null])
    const before = snap('c0').match!.step
    // Advance until a human must choose; bots and auto-draws move things along meanwhile.
    for (let i = 0; i < 200 && snap('c0').match!.legal.length + snap('c1').match!.legal.length === 0; i++) env.advance(1000)
    expect(snap('c0').match!.legal.length + snap('c1').match!.legal.length).toBeGreaterThan(0)
    expect(snap('c0').match!.step).toBeGreaterThanOrEqual(before)
  })

  it('ignores stale and illegal actions', () => {
    const { env, table, snap } = setup(['Ann'])
    table.start('c0')
    for (let i = 0; i < 200 && snap('c0').match!.legal.length === 0; i++) env.advance(1000)
    const m = snap('c0').match!
    const before = state(table)
    table.act('c0', { step: m.step - 1, action: m.legal[0] })
    table.act('c0', { step: m.step, action: { type: 'discard', seat: m.view!.seat, tileId: 999 } })
    table.act('c0', { step: m.step, action: { type: 'chow', seat: m.view!.seat, tileIds: 'nope' } })
    table.act('c0', 'garbage')
    expect(state(table)).toBe(before)
    table.act('c0', { step: m.step, action: m.legal[0] })
    expect(state(table)).not.toBe(before)
  })

  it('passes for a human whose claim timer runs out', () => {
    const { env, table, snap } = setup(['Ann'])
    table.start('c0')
    let claimMs: number | null = null
    for (let i = 0; i < 2000 && claimMs === null; i++) {
      const m = snap('c0').match!
      if (m.claimMs !== null) claimMs = m.claimMs
      else if (m.legal.length && m.view!.phase.kind === 'discard') table.act('c0', { step: m.step, action: m.legal.find((a) => a.type === 'discard') })
      else env.advance(200)
    }
    // The window may have opened a moment before this snapshot (a bot answered first).
    expect(claimMs).toBeGreaterThan(9_000)
    expect(claimMs).toBeLessThanOrEqual(10_000)
    const step = snap('c0').match!.step
    env.advance(10_000)
    expect(snap('c0').match!.step).toBeGreaterThan(step)
    expect(snap('c0').match!.claimMs).not.toBe(10_000)
  })

  it('makes a move for a human who sits on their turn', () => {
    const { env, table, snap } = setup(['Ann'])
    table.start('c0')
    const myDiscard = () => {
      const v = snap('c0').match!.view!
      return v.phase.kind === 'discard' && v.turn === v.seat
    }
    for (let i = 0; i < 2000 && !myDiscard(); i++) {
      const m = snap('c0').match!
      if (m.claimMs !== null) table.act('c0', { step: m.step, action: m.legal.find((a) => a.type === 'pass') })
      else env.advance(200)
    }
    const step = snap('c0').match!.step
    env.advance(TURN_MS)
    expect(snap('c0').match!.step).toBeGreaterThan(step)
  })

  it('lets a bot cover a dropped player, who can reclaim the seat with their token', () => {
    const { env, table, snap } = setup(['Ann', 'Bo'])
    table.start('c0')
    const token = snap('c1').token
    table.leave('c1')
    expect(snap('c0').players[1]).toEqual({ name: 'Bo', connected: false })
    // With Bo gone, only Ann ever has to act.
    for (let i = 0; i < 300; i++) {
      autoplay(table, ['c0'], snap)
      env.advance(1000)
    }
    expect(snap('c0').match!.step).toBeGreaterThan(20)
    expect(table.canJoin(token)).toBe(true)
    expect(table.canJoin('someone-else')).toBe(false)
    expect(table.join('c9', { token })).toBe(1)
    expect(table.snapshotFor('c9')!.players[1]).toEqual({ name: 'Bo', connected: true })
  })

  it('pauses while nobody is connected', () => {
    const { env, table, snap } = setup(['Ann'])
    table.start('c0')
    const token = snap('c0').token
    table.leave('c0')
    const before = state(table)
    env.advance(600_000)
    expect(state(table)).toBe(before)
    table.join('c0', { token })
    // Play resumes: bots move, or Ann's own turn times out.
    env.advance(TURN_MS + 5_000)
    expect(state(table)).not.toBe(before)
  })

  it('plays a whole match to the end and returns to the lobby', () => {
    const { env, table, clients, snap } = setup(['Ann', 'Bo', 'Cy'])
    table.configure('c0', { difficulty: 'easy' })
    table.start('c0')
    for (let i = 0; i < 100_000 && !snap('c0').match!.over; i++) {
      autoplay(table, clients, snap)
      env.advance(500)
    }
    const m = snap('c0').match!
    expect(m.over).toBe(true)
    expect(m.view).toBeNull()
    expect(m.scores.reduce((a, b) => a + b, 0)).toBe(0)
    table.restart('c1') // not the host
    expect(snap('c0').phase).toBe('playing')
    table.restart('c0')
    expect(snap('c0').phase).toBe('lobby')
    expect(snap('c0').players.map((p) => p.name)).toEqual(['Ann', 'Bo', 'Cy', null])
    expect(([0, 1, 2] as Player[]).every((p) => snap(clients[p]!).you === p)).toBe(true)
  })
})
