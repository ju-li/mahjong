import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  applyAction,
  isMatchOver,
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
import type { Difficulty } from '../bots/protocol'
import { BotClient } from './botClient'
import { timeoutAction } from './keyboard'
import { useSettings } from './settings'

/** The human is always player 0; their table seat changes between rounds. */
export const HUMAN_PLAYER: Player = 0
const SEATS: Seat[] = [0, 1, 2, 3]
const STORAGE_KEY = 'mahjong.match.v2'

const BOT_DELAY_MS = 450
const QUICK_DELAY_MS = 120

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Saved = { match: Match; difficulty: Difficulty }

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    const m = saved?.match
    if (typeof m?.seed !== 'number' || typeof m.handIndex !== 'number' || !Array.isArray(m.scores) || !Array.isArray(m.seating)) return null
    if (!['easy', 'medium', 'hard'].includes(saved.difficulty)) return null
    return saved
  } catch {
    return null
  }
}

function save(data: Saved): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage unavailable (private mode, quota): the match simply isn't resumable.
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}

/**
 * Drives a 16-hand match. Bots act through the worker, the human through `act`.
 * All rules come from the engine; this file only sequences turns and persists progress.
 */
export function useMatch() {
  const bots = new BotClient()
  const saved = load()
  const match = shallowRef<Match>(saved?.match ?? newMatch(randomSeed()))
  const difficulty = ref<Difficulty>(saved?.difficulty ?? 'medium')
  let generation = 0
  let step = 0
  let running = false

  const humanSeat = computed(() => seatOf(match.value, HUMAN_PLAYER))
  /** `seatPlayers[seat]` = player sitting there this round. */
  const seatPlayers = computed(() => SEATS.map((seat) => playerAt(match.value, seat)))
  const state = computed(() => match.value.current)
  const view = computed(() => (state.value ? viewFor(state.value, humanSeat.value) : null))
  const humanActions = computed(() => (state.value ? legalActions(state.value, humanSeat.value) : []))
  const handOver = computed(() => state.value?.phase.kind === 'ended')

  // Claim timer: counts down while the human may claim; on expiry it passes (only if legal).
  const { claimSeconds } = useSettings()
  const claimRemaining = ref<number | null>(null)
  let claimTimer: ReturnType<typeof setInterval> | undefined
  /** Identifies one claim window for the human, so bot replies inside it do not restart the clock. */
  const claimKey = computed(() => {
    const s = state.value
    if (!s || (s.phase.kind !== 'claim' && s.phase.kind !== 'robKong')) return null
    if (!timeoutAction(humanActions.value)) return null
    return `${match.value.handIndex}:${s.phase.kind}:${s.phase.tile.id}:${claimSeconds.value}`
  })
  watch(claimKey, (key) => {
    clearInterval(claimTimer)
    claimRemaining.value = null
    if (key === null || claimSeconds.value === 0) return
    claimRemaining.value = claimSeconds.value
    claimTimer = setInterval(() => {
      claimRemaining.value = (claimRemaining.value ?? 1) - 1
      if (claimRemaining.value > 0) return
      clearInterval(claimTimer)
      claimRemaining.value = null
      const pass = timeoutAction(humanActions.value)
      if (pass) act(pass)
    }, 1000)
  })
  const matchOver = computed(() => isMatchOver(match.value))

  watch([match, difficulty], () => save({ match: match.value, difficulty: difficulty.value }), { immediate: true })

  function commit(action: Action): void {
    const current = match.value.current!
    match.value = { ...match.value, current: applyAction(current, action) }
    step++
  }

  /** Advance until the hand ends or the human must choose. */
  async function pump(): Promise<void> {
    if (running) return
    running = true
    const gen = generation
    try {
      while (gen === generation) {
        const s = match.value.current
        if (!s || s.phase.kind === 'ended') return
        const me = seatOf(match.value, HUMAN_PLAYER)
        const human = legalActions(s, me)
        if (human.length === 1 && human[0]!.type === 'draw') {
          await sleep(QUICK_DELAY_MS)
          if (gen !== generation) return
          commit(human[0]!)
          continue
        }
        const botSeat = SEATS.find((seat) => seat !== me && legalActions(s, seat).length > 0)
        if (botSeat === undefined) return // only the human can act now
        const legal = legalActions(s, botSeat)
        const quick = legal.every((a) => a.type === 'draw' || a.type === 'pass' || a.type === 'win')
        const [action] = await Promise.all([
          bots.decide({
            view: viewFor(s, botSeat),
            legal,
            difficulty: difficulty.value,
            seed: (s.seed ^ Math.imul(step + 1, 2654435761)) >>> 0,
          }),
          sleep(quick ? QUICK_DELAY_MS : BOT_DELAY_MS),
        ])
        if (gen !== generation) return
        // The human may have acted while the bot was thinking; re-ask if its answer went stale.
        const now = match.value.current
        if (now && legalActions(now, botSeat).some((a) => sameAction(a, action))) commit(action)
      }
    } finally {
      if (gen === generation) running = false
    }
  }

  function restartPump(): void {
    generation++
    running = false
    step = 0
    void pump()
  }

  function act(action: Action): void {
    const s = match.value.current
    if (!s || !legalActions(s, humanSeat.value).some((a) => sameAction(a, action))) return
    commit(action)
    void pump()
  }

  function continueToNextHand(): void {
    const s = match.value.current
    if (!s || s.phase.kind !== 'ended') return
    match.value = nextHand(match.value, s.phase.result)
    restartPump()
  }

  function startNewMatch(): void {
    match.value = newMatch(randomSeed())
    restartPump()
  }

  onBeforeUnmount(() => {
    generation++
    clearInterval(claimTimer)
    bots.dispose()
  })

  void pump()

  return {
    match,
    humanSeat,
    seatPlayers,
    view,
    humanActions,
    claimRemaining,
    handOver,
    matchOver,
    difficulty,
    act,
    continueToNextHand,
    startNewMatch,
  }
}
