import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  applyAction,
  isMatchOver,
  legalActions,
  newMatch,
  nextHand,
  sameAction,
  viewFor,
  type Action,
  type Match,
  type Seat,
} from '@mahjong/engine'
import type { Difficulty } from '../bots/protocol'
import { BotClient } from './botClient'

export const HUMAN: Seat = 0
const SEATS: Seat[] = [0, 1, 2, 3]
const STORAGE_KEY = 'mahjong.match.v1'

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
    if (typeof m?.seed !== 'number' || typeof m.handIndex !== 'number' || !Array.isArray(m.scores)) return null
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

  const state = computed(() => match.value.current)
  const view = computed(() => (state.value ? viewFor(state.value, HUMAN) : null))
  const humanActions = computed(() => (state.value ? legalActions(state.value, HUMAN) : []))
  const handOver = computed(() => state.value?.phase.kind === 'ended')
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
        const human = legalActions(s, HUMAN)
        if (human.length === 1 && human[0]!.type === 'draw') {
          await sleep(QUICK_DELAY_MS)
          if (gen !== generation) return
          commit(human[0]!)
          continue
        }
        const botSeat = SEATS.find((seat) => seat !== HUMAN && legalActions(s, seat).length > 0)
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
    if (!s || !legalActions(s, HUMAN).some((a) => sameAction(a, action))) return
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
    bots.dispose()
  })

  void pump()

  return {
    match,
    view,
    humanActions,
    handOver,
    matchOver,
    difficulty,
    act,
    continueToNextHand,
    startNewMatch,
  }
}
