import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
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
  isRuleSet,
  type Action,
  type Match,
  type RuleSet,
  type Player,
  type Seat,
} from '@mahjong/engine'
import { BotClient } from './botClient'
import { timeoutAction } from './keyboard'
import { useSettings } from './settings'
import { calloutsDone } from './callout'
import type { MatchSource } from './source'
import { useTableAudio } from './tableAudio'
import { useI18n } from '../i18n/useI18n'

/** The human is always player 0; their table seat changes between rounds. */
export const HUMAN_PLAYER: Player = 0
const SEATS: Seat[] = [0, 1, 2, 3]
const STORAGE_KEY = 'mahjong.match.v2'

const BOT_DELAY_MS = 450
const QUICK_DELAY_MS = 120

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Difficulty and preferred rules live in settings; older saves also carry a `difficulty` field, now ignored. */
type Saved = { match: Match }

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    const m = saved?.match
    if (typeof m?.seed !== 'number' || typeof m.handIndex !== 'number' || !Array.isArray(m.scores) || !Array.isArray(m.seating)) return null
    // Matches saved before rule sets existed are MCR.
    if (!isRuleSet(m.rules)) m.rules = 'mcr'
    if (m.current && !isRuleSet(m.current.rules)) m.current.rules = m.rules
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
 * While `paused` (the player is at an online table) or on a break (`pause`), nothing moves and no timer runs.
 */
export function useMatch(paused: Readonly<Ref<boolean>> = ref(false)) {
  const bots = new BotClient()
  const saved = load()
  const { claimSeconds, difficulty, rules: preferredRules, needsOnboarding } = useSettings()
  const { t } = useI18n()
  const match = shallowRef<Match>(saved?.match ?? newMatch(randomSeed(), preferredRules.value))
  let generation = 0
  let step = 0
  let running = false
  /** The player paused for a break. */
  const onBreak = ref(false)
  const held = computed(() => paused.value || onBreak.value)

  const humanSeat = computed(() => seatOf(match.value, HUMAN_PLAYER))
  /** `seatPlayers[seat]` = player sitting there this round. */
  const seatPlayers = computed(() => SEATS.map((seat) => playerAt(match.value, seat)))
  const state = computed(() => match.value.current)
  const view = computed(() => (state.value ? viewFor(state.value, humanSeat.value) : null))
  const humanActions = computed(() => (state.value ? legalActions(state.value, humanSeat.value) : []))
  const handOver = computed(() => state.value?.phase.kind === 'ended')

  useTableAudio(view)
  // Claim timer: counts down while the human may claim; on expiry it passes (only if legal).
  const claimRemaining = ref<number | null>(null)
  let claimTimer: ReturnType<typeof setInterval> | undefined
  /** Identifies one claim window for the human, so bot replies inside it do not restart the clock. */
  const claimKey = computed(() => {
    const s = state.value
    if (needsOnboarding.value || held.value) return null
    if (!s || (s.phase.kind !== 'claim' && s.phase.kind !== 'robKong')) return null
    if (!timeoutAction(humanActions.value)) return null
    return `${match.value.handIndex}:${s.phase.kind}:${s.phase.tile.id}:${claimSeconds.value}`
  })
  /** Time left on a claim when play was held, so the countdown resumes rather than restarts. */
  let heldClaim: { key: string; left: number } | null = null
  watch(claimKey, (key, before) => {
    clearInterval(claimTimer)
    if (key === null && before && held.value && claimRemaining.value !== null) heldClaim = { key: before, left: claimRemaining.value }
    claimRemaining.value = null
    if (key === null || claimSeconds.value === 0) return
    claimRemaining.value = heldClaim?.key === key ? heldClaim.left : claimSeconds.value
    heldClaim = null
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

  watch(match, () => save({ match: match.value }), { immediate: true })

  function commit(action: Action): void {
    const current = match.value.current!
    match.value = { ...match.value, current: applyAction(current, action) }
    step++
  }

  /** Advance until the hand ends or the human must choose. */
  async function pump(): Promise<void> {
    if (running || needsOnboarding.value || held.value) return
    running = true
    const gen = generation
    try {
      while (gen === generation) {
        // Let the last call finish before anyone moves on, as players would at a real table.
        await calloutsDone()
        if (gen !== generation || held.value) return
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
    if (held.value || !s || !legalActions(s, humanSeat.value).some((a) => sameAction(a, action))) return
    commit(action)
    void pump()
  }

  function continueToNextHand(): void {
    const s = match.value.current
    if (!s || s.phase.kind !== 'ended') return
    match.value = nextHand(match.value, s.phase.result)
    restartPump()
  }

  const rules = computed<RuleSet>(() => match.value.rules)

  /** Start a fresh match; keeps the current rule set unless another is given. */
  function startNewMatch(next: RuleSet = match.value.rules): void {
    preferredRules.value = next
    match.value = newMatch(randomSeed(), next)
    restartPump()
  }

  onBeforeUnmount(() => {
    generation++
    clearInterval(claimTimer)
    bots.dispose()
  })

  // Play waits behind the onboarding dialog, and while paused.
  watch([needsOnboarding, held], ([waiting, hold]) => {
    if (!waiting && !hold) return void pump()
    // Drop any bot move still in flight.
    generation++
    running = false
  })
  void pump()

  /** Bots are numbered by where they sit relative to you at the start of the match. */
  const playerNames = computed(() => [t('player.you'), t('player.bot', { n: 1 }), t('player.bot', { n: 2 }), t('player.bot', { n: 3 })])
  const scores = computed(() => match.value.scores)
  const matchSeed = computed(() => match.value.seed)
  const handIndex = computed(() => match.value.handIndex)
  /** A hand has been played or is under way, so starting over would throw progress away. */
  const inProgress = () => match.value.history.length > 0 || (match.value.current !== null && !handOver.value)

  const source: MatchSource = {
    view,
    actions: humanActions,
    seatPlayers,
    playerNames,
    scores,
    matchSeed,
    handIndex,
    rules,
    claimRemaining,
    matchOver,
    act,
    continueToNextHand,
  }

  return {
    ...source,
    difficulty,
    inProgress,
    onBreak,
    pause: () => void (onBreak.value = true),
    resume: () => void (onBreak.value = false),
    /** A match was restored from storage rather than dealt fresh. */
    resumed: saved !== null,
    startNewMatch,
  }
}
