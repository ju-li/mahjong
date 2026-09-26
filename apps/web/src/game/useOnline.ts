import { computed, ref, shallowRef, watch } from 'vue'
import { Client, type Room } from '@colyseus/sdk'
import type { Action } from '@mahjong/engine'
import { ROOM_NAME, type ClientMessages, type JoinOptions, type Snapshot, type TableSettings, type VoiceClip, type VoiceMemo } from '@mahjong/protocol'
import { useI18n } from '../i18n/useI18n'
import { useSettings } from './settings'
import type { MatchSource } from './source'
import { useTableAudio } from './tableAudio'
import { useVoicePlayer } from './voiceChat'

/** Game server address: set at build time for deploys; the local dev server otherwise. */
const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`

const NAME_KEY = 'mahjong.name'
const TOKEN_KEY = (code: string) => `mahjong.seat.${code}`
/** The table this tab is at, so a reload goes straight back to it. */
const CURRENT_KEY = 'mahjong.table'

export type OnlineError = 'notFound' | 'full' | 'network'
/** The link to the table: fine, being restored on its own, or gone until the player picks what to do. */
export type Link = 'up' | 'reconnecting' | 'lost'

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    // Storage unavailable: rejoining after a reload won't be automatic.
  }
}

/** Colyseus refuses a join with a code: 522 = no such room, 4003 = ours for full or under way. */
function classify(error: unknown): OnlineError {
  const code = (error as { code?: number })?.code
  if (code === 522) return 'notFound'
  if (code === 4003 || code === 525) return 'full'
  return 'network'
}

/**
 * Connection to an online table. Holds the latest snapshot the server sent and turns it into a
 * `MatchSource` for the table screen; lobby controls send straight to the server.
 */
export function useOnline() {
  const { t } = useI18n()
  const client = new Client(SERVER_URL)
  let room: Room | null = null
  const snapshot = shallowRef<Snapshot | null>(null)
  const busy = ref(false)
  const error = ref<OnlineError | null>(null)
  const link = ref<Link>('up')
  const name = ref(read(() => localStorage, NAME_KEY) ?? '')
  watch(name, (value) => write(() => localStorage, NAME_KEY, value.trim() || null))
  const { voiceChat } = useSettings()
  const voicePlayer = useVoicePlayer()
  watch(voiceChat, (on) => on || voicePlayer.clear())

  function attach(r: Room): void {
    room = r
    r.onMessage('snapshot', (s: Snapshot) => {
      snapshot.value = s
      write(() => localStorage, TOKEN_KEY(s.code), s.token)
      write(() => sessionStorage, CURRENT_KEY, s.code)
    })
    r.onMessage('voice', (memo: VoiceMemo) => {
      if (room === r && voiceChat.value) voicePlayer.enqueue(memo)
    })
    // The SDK retries a dropped socket by itself for a while; the table stays on screen meanwhile.
    r.onDrop(() => {
      if (room === r) link.value = 'reconnecting'
    })
    r.onReconnect(() => {
      if (room === r) link.value = 'up'
      else void r.leave() // the player went solo while this was retrying
    })
    r.onLeave(() => {
      if (room !== r) return // we left on purpose
      const code = snapshot.value?.code
      room = null
      if (!code) return
      // The SDK's own reconnection gave up; try once more with the seat token, then let the player choose.
      link.value = 'reconnecting'
      void join(code).then((ok) => {
        if (!ok && snapshot.value?.code === code) link.value = 'lost'
      })
    })
  }

  /** Bumped on every leave, so a join still in flight when the player goes solo is dropped. */
  let generation = 0

  async function connect(open: () => Promise<Room>): Promise<boolean> {
    busy.value = true
    error.value = null
    const started = generation
    try {
      const r = await open()
      if (started !== generation) {
        void r.leave()
        return false
      }
      attach(r)
      link.value = 'up'
      return true
    } catch (e) {
      error.value = classify(e)
      return false
    } finally {
      busy.value = false
    }
  }

  const options = (code?: string): JoinOptions => ({
    name: name.value.trim() || undefined,
    token: code ? (read(() => localStorage, TOKEN_KEY(code)) ?? undefined) : undefined,
  })

  const host = () => connect(() => client.create(ROOM_NAME, options()))
  const join = (code: string) => connect(() => client.joinById(code, options(code)))

  /** Back to solo play. Mid-match a bot keeps your seat, and the saved token can bring you back. */
  async function leave(): Promise<void> {
    const r = room
    room = null
    generation++
    link.value = 'up'
    snapshot.value = null
    voicePlayer.clear()
    error.value = null
    write(() => sessionStorage, CURRENT_KEY, null)
    await r?.leave().catch(() => {})
  }

  /** After a reload: rejoin the table this tab was at, if any. */
  function rejoin(): Promise<boolean> {
    const code = read(() => sessionStorage, CURRENT_KEY)
    return code ? join(code) : Promise.resolve(false)
  }

  /** After losing the table: try to take the seat back. */
  function reconnect(): Promise<boolean> {
    const code = snapshot.value?.code
    if (!code || link.value !== 'lost') return Promise.resolve(false)
    link.value = 'reconnecting'
    return join(code).then((ok) => {
      if (!ok && snapshot.value?.code === code) link.value = 'lost'
      return ok
    })
  }

  function send<K extends keyof ClientMessages>(type: K, message: ClientMessages[K]): void {
    room?.send(type, message)
  }

  const me = computed(() => snapshot.value?.you ?? 0)
  const isHost = computed(() => snapshot.value !== null && snapshot.value.host === snapshot.value.you)
  const match = computed(() => snapshot.value?.match ?? null)

  // Claim countdown, ticking locally from the time left when the snapshot arrived.
  const claimRemaining = ref<number | null>(null)
  let claimTimer: ReturnType<typeof setInterval> | undefined
  const paused = computed(() => match.value?.paused ?? null)
  watch(
    [() => match.value?.claimMs ?? null, paused],
    ([ms, stopped]) => {
      clearInterval(claimTimer)
      if (ms === null) return void (claimRemaining.value = null)
      // Paused: the server holds the clock, so show the time left without counting down.
      if (stopped !== null) return void (claimRemaining.value = Math.ceil(ms / 1000))
      const deadline = performance.now() + ms
      const tick = () => {
        const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000))
        claimRemaining.value = left
        if (left === 0) clearInterval(claimTimer)
      }
      tick()
      claimTimer = setInterval(tick, 250)
    },
  )

  const view = computed(() => match.value?.view ?? null)
  useTableAudio(view)

  /** You are "You"; other people by name (marked while away); bots numbered in seat order. */
  const playerNames = computed(() => {
    const s = snapshot.value
    if (!s) return []
    let bots = 0
    return s.players.map((slot, p) => {
      if (p === s.you) return t('player.you')
      if (slot.name === null) return t('player.bot', { n: ++bots })
      return slot.connected ? slot.name : t('player.away', { name: slot.name })
    })
  })

  const source: MatchSource = {
    view,
    actions: computed(() => match.value?.legal ?? []),
    seatPlayers: computed(() => match.value?.seatPlayers ?? [0, 1, 2, 3]),
    playerNames,
    scores: computed(() => match.value?.scores ?? [0, 0, 0, 0]),
    matchSeed: computed(() => match.value?.avatarSeed ?? 0),
    handIndex: computed(() => match.value?.handIndex ?? 0),
    rules: computed(() => snapshot.value?.settings.rules ?? 'mcr'),
    claimRemaining,
    matchOver: computed(() => match.value?.over ?? false),
    waiting: computed(() => !!match.value?.ready[me.value]),
    pausedBy: computed(() => (paused.value === null ? null : (playerNames.value[paused.value] ?? null))),
    speaking: voicePlayer.speaking,
    act(action: Action) {
      const m = match.value
      if (m) send('act', { step: m.step, action })
    },
    continueToNextHand() {
      send('ready', {})
    },
  }

  return {
    snapshot,
    source,
    busy,
    error,
    link,
    reconnect,
    name,
    isHost,
    host,
    join,
    leave,
    rejoin,
    configure: (settings: Partial<TableSettings>) => send('configure', settings),
    start: () => send('start', {}),
    restart: () => send('restart', {}),
    rematch: () => send('rematch', {}),
    pause: () => send('pause', {}),
    resume: () => send('resume', {}),
    rename: () => send('rename', { name: name.value }),
    sendVoice: (clip: VoiceClip) => send('voice', clip),
    /** Player whose voice memo is playing, if any. */
    speaking: voicePlayer.speaking,
    playerNames,
  }
}
