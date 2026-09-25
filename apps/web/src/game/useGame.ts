import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import {
  applyAction,
  legalActions,
  newHand,
  sameAction,
  viewFor,
  type Action,
  type GameState,
  type Seat,
} from '@mahjong/engine'
import type { Difficulty } from '../bots/protocol'
import { BotClient } from './botClient'

export const HUMAN: Seat = 0
const SEATS: Seat[] = [0, 1, 2, 3]

const BOT_DELAY_MS = 450
const QUICK_DELAY_MS = 120

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Drives one hand: bots act through the worker, the human acts through `act`.
 * All rules come from the engine; this file only sequences turns.
 */
export function useGame() {
  const bots = new BotClient()
  const state = shallowRef<GameState>(newHand({ seed: randomSeed(), dealer: 0, prevailingWind: 'E' }))
  const difficulty = ref<Difficulty>('easy')
  let generation = 0
  let step = 0
  let running = false

  const view = computed(() => viewFor(state.value, HUMAN))
  const humanActions = computed(() => legalActions(state.value, HUMAN))
  const waitingForHuman = computed(() => humanActions.value.some((a) => a.type !== 'draw'))

  function commit(action: Action): void {
    state.value = applyAction(state.value, action)
    step++
  }

  /** Advance until the hand ends or the human must choose. */
  async function pump(): Promise<void> {
    if (running) return
    running = true
    const gen = generation
    try {
      while (gen === generation && state.value.phase.kind !== 'ended') {
        const human = legalActions(state.value, HUMAN)
        if (human.length === 1 && human[0]!.type === 'draw') {
          await sleep(QUICK_DELAY_MS)
          if (gen !== generation) return
          commit(human[0]!)
          continue
        }
        const botSeat = SEATS.find((s) => s !== HUMAN && legalActions(state.value, s).length > 0)
        if (botSeat === undefined) return // only the human can act now
        const legal = legalActions(state.value, botSeat)
        const quick = legal.every((a) => a.type === 'draw' || a.type === 'pass' || a.type === 'win')
        const [action] = await Promise.all([
          bots.decide({
            view: viewFor(state.value, botSeat),
            legal,
            difficulty: difficulty.value,
            seed: (state.value.seed ^ (step * 2654435761)) >>> 0,
          }),
          sleep(quick ? QUICK_DELAY_MS : BOT_DELAY_MS),
        ])
        if (gen !== generation) return
        // The human may have acted while the bot was thinking; re-ask if its answer went stale.
        if (legalActions(state.value, botSeat).some((a) => sameAction(a, action))) commit(action)
      }
    } finally {
      if (gen === generation) running = false
    }
  }

  function act(action: Action): void {
    if (!legalActions(state.value, HUMAN).some((a) => sameAction(a, action))) return
    commit(action)
    void pump()
  }

  function startHand(seed = randomSeed()): void {
    generation++
    running = false
    step = 0
    state.value = newHand({ seed, dealer: 0, prevailingWind: 'E' })
    void pump()
  }

  onBeforeUnmount(() => {
    generation++
    bots.dispose()
  })

  void pump()

  return { state, view, humanActions, waitingForHuman, difficulty, act, startHand }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}
