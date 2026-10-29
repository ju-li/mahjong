import { computed, ref, shallowRef, watch } from 'vue'
import { Client, type Room } from '@colyseus/sdk'
import { houseOf, type Action } from '@mahjong/engine'
import { KICKED_CODE, REMOVED_CODE, ROOM_NAME, TABLE_FULL_CODE, TABLE_MOVING_CODE, type ClientMessages, type JoinOptions, type RatingChange, type Reaction, type ReactionId, type Snapshot, type TableSettings, type VoiceClip, type VoiceMemo } from '@mahjong/protocol'
import { useI18n } from '../i18n/useI18n'
import { track } from './analytics'
import { useProfile } from './profile'
import { reactionThrottle, useReactionFeed } from './reactions'
import { useAccount } from './useAccount'
import { SERVER_URL } from './serverUrl'
import { useSettings } from './settings'
import type { MatchSource, Readiness } from './source'
import { useTableAudio } from './tableAudio'
import { useVoicePlayer } from './voiceChat'


const TOKEN_KEY = (code: string) => `mahjong.seat.${code}`
/** The table this tab is at, so a reload goes straight back to it. */
const CURRENT_KEY = 'mahjong.table'
/** How long to keep trying to get back to a table after losing it, e.g. while the server restarts for a deploy. */
const RETURN_MS = 2 * 60_000

export type OnlineError = 'notFound' | 'full' | 'removed' | 'network'
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

/** Why a join failed; `moving` = the table is on its way to a new server process, so try again shortly. */
type JoinFailure = OnlineError | 'moving'

/** Colyseus refuses a join with a code: 522 = no such room; the rest are ours (see `@mahjong/protocol`). */
function classify(error: unknown): JoinFailure {
  const code = (error as { code?: number })?.code
  if (code === 522) return 'notFound'
  if (code === TABLE_FULL_CODE || code === 525) return 'full'
  if (code === REMOVED_CODE) return 'removed'
  if (code === TABLE_MOVING_CODE) return 'moving'
  return 'network'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
  /** Code of the table the host last removed you from, for a notice; the caller clears it. */
  const removedFrom = ref<string | null>(null)
  const link = ref<Link>('up')
  /** Your rating change from the match just finished, once the server has saved it. */
  const rating = shallowRef<RatingChange | null>(null)
  watch(() => snapshot.value?.match?.final ?? false, (final) => final || (rating.value = null))
  const { name, avatar } = useProfile()
  const account = useAccount()
  /** Emoji reactions floating up at the table, yours and everyone else's. */
  const reactions = useReactionFeed()
  const mayReact = reactionThrottle()
  /** What the host allows at this table; both on until the first snapshot says otherwise. */
  const chat = computed(() => ({ voiceChat: snapshot.value?.settings.voiceChat ?? true, reactions: snapshot.value?.settings.reactions ?? true }))
  const { voiceChat } = useSettings()
  const voicePlayer = useVoicePlayer()
  // Muted here, or switched off by the host: stop what is playing and drop what is waiting.
  watch([voiceChat, () => chat.value.voiceChat], ([mine, table]) => (mine && table) || voicePlayer.clear())
  watch(() => chat.value.reactions, (on) => on || reactions.clear())

  function attach(r: Room): void {
    room = r
    r.onMessage('snapshot', (s: Snapshot) => {
      countMilestones(snapshot.value, s)
      snapshot.value = s
      write(() => localStorage, TOKEN_KEY(s.code), s.token)
      write(() => sessionStorage, CURRENT_KEY, s.code)
    })
    r.onMessage('rated', (change: RatingChange) => {
      if (room === r) rating.value = change
    })
    r.onMessage('reaction', (m: Reaction) => {
      if (room === r) reactions.push(m.from, m.reaction)
    })
    r.onMessage('voice', (memo: VoiceMemo) => {
      if (room === r && voiceChat.value && chat.value.voiceChat) voicePlayer.enqueue(memo)
    })
    // The SDK retries a dropped socket by itself for a while; the table stays on screen meanwhile.
    r.onDrop(() => {
      if (room === r) link.value = 'reconnecting'
    })
    r.onReconnect(() => {
      if (room === r) link.value = 'up'
      else void r.leave() // the player went solo while this was retrying
    })
    r.onLeave((closeCode?: number) => {
      if (room !== r) return // we left on purpose
      const code = snapshot.value?.code
      room = null
      if (!code) return
      if (closeCode === KICKED_CODE) {
        // Removed by the host: no coming back, so forget the seat and go back to solo.
        write(() => localStorage, TOKEN_KEY(code), null)
        removedFrom.value = code
        void leave()
        return
      }
      // The SDK's own reconnection gave up, or the server restarted (a deploy): get the seat back
      // with its token, which also brings the table back on a new server, then let the player choose.
      link.value = 'reconnecting'
      void comeBack(code).then((ok) => {
        if (!ok && snapshot.value?.code === code) link.value = 'lost'
      })
    })
  }

  /** A match starting or ending at the table you are at; not ones already under way when you (re)joined. */
  function countMilestones(before: Snapshot | null, now: Snapshot): void {
    if (before?.code !== now.code) return
    // From the lobby, or "keep going" after the last hand.
    if ((before.phase === 'lobby' && now.phase === 'playing') || (before.match?.final && now.match && !now.match.final)) track('online_match_started')
    if (before.match && now.match && !before.match.final && now.match.final) track('online_match_finished')
  }

  /** Bumped on every leave, so a join still in flight when the player goes solo is dropped. */
  let generation = 0
  /** Why the last join failed. */
  let failure: JoinFailure | null = null

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
      failure = null
      return true
    } catch (e) {
      failure = classify(e)
      error.value = failure === 'moving' ? 'network' : failure
      return false
    } finally {
      busy.value = false
    }
  }

  const options = async (code?: string): Promise<JoinOptions> => ({
    name: name.value.trim() || undefined,
    avatar: avatar.value,
    token: code ? (read(() => localStorage, TOKEN_KEY(code)) ?? undefined) : undefined,
    // Signed-in players show up as themselves, so others at the table can add them as a friend.
    accessToken: await account.accessToken(),
  })

  /** Host a new table; resolves with its code (the room id) once seated, before its first snapshot arrives. */
  async function host(): Promise<string | null> {
    if (!(await connect(async () => client.create(ROOM_NAME, await options())))) return null
    track('table_hosted')
    return room?.roomId ?? null
  }
  /** Sit at a table by its code: from an invite, the join dialog, or to rejoin (only the first two are counted). */
  async function join(code: string, count = false): Promise<boolean> {
    let ok = await connect(async () => client.joinById(code, await options(code)))
    // Not open on the server: it may have been saved before a restart, so bring it back.
    if (!ok && failure === 'notFound') ok = await connect(async () => client.create(ROOM_NAME, { ...(await options(code)), restore: code }))
    if (ok && count) track('table_joined')
    return ok
  }

  /**
   * Back to a table you were at, trying again for a while if the server can't take you yet (it is
   * restarting, or handing the table on to a new process). Gives up at once if the table is gone,
   * full or you were removed, or when you go solo.
   */
  async function comeBack(code: string): Promise<boolean> {
    const started = generation
    const until = Date.now() + RETURN_MS
    for (let attempt = 0; ; attempt++) {
      if (await join(code)) return true
      if (started !== generation || (failure !== 'network' && failure !== 'moving') || Date.now() >= until) return false
      await sleep(Math.min(500 * 2 ** attempt, 5000))
      if (started !== generation) return false
    }
  }

  // Signing in or out while seated updates the seat.
  watch(account.signedIn, async () => {
    if (room) send('identify', { accessToken: (await account.accessToken()) ?? null })
  })

  /** Back to solo play. Mid-match a bot keeps your seat, and the saved token can bring you back. */
  async function leave(): Promise<void> {
    const r = room
    room = null
    generation++
    link.value = 'up'
    snapshot.value = null
    reactions.clear()
    voicePlayer.clear()
    error.value = null
    write(() => sessionStorage, CURRENT_KEY, null)
    await r?.leave().catch(() => {})
  }

  /** After a reload: rejoin the table this tab was at, if any. */
  function rejoin(): Promise<boolean> {
    const code = read(() => sessionStorage, CURRENT_KEY)
    return code ? comeBack(code) : Promise.resolve(false)
  }

  /** After losing the table: try to take the seat back. */
  function reconnect(): Promise<boolean> {
    const code = snapshot.value?.code
    if (!code || link.value !== 'lost') return Promise.resolve(false)
    link.value = 'reconnecting'
    return comeBack(code).then((ok) => {
      if (!ok && snapshot.value?.code === code) link.value = 'lost'
      return ok
    })
  }

  function send<K extends keyof ClientMessages>(type: K, message: ClientMessages[K]): void {
    room?.send(type, message)
  }

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

  /** You by your own name (or "You"); other people by name (marked while away); bots numbered in seat order. */
  const playerNames = computed(() => {
    const s = snapshot.value
    if (!s) return []
    let bots = 0
    return s.players.map((slot, p) => {
      if (p === s.you) return name.value.trim() || t('player.you')
      if (slot.name === null) return t('player.bot', { n: ++bots })
      return slot.connected ? slot.name : t('player.away', { name: slot.name })
    })
  })

  /** Just after a server restart: names of the players the table is waiting for, or null. */
  const waitingFor = computed(() => {
    const s = snapshot.value
    const waiting = s?.match?.returning
    return s && waiting?.length ? waiting.map((p) => s.players[p]?.name ?? t('player.bot', { n: p + 1 })) : null
  })

  const source: MatchSource = {
    view,
    actions: computed(() => match.value?.legal ?? []),
    seatPlayers: computed(() => match.value?.seatPlayers ?? [0, 1, 2, 3]),
    playerNames,
    scores: computed(() => match.value?.scores ?? [0, 0, 0, 0]),
    matchSeed: computed(() => match.value?.avatarSeed ?? 0),
    avatarChoices: computed(() => snapshot.value?.players.map((slot) => slot.avatar) ?? []),
    handIndex: computed(() => match.value?.handIndex ?? 0),
    rules: computed(() => snapshot.value?.settings.rules ?? 'mcr'),
    house: computed(() => view.value?.house ?? houseOf({ rules: snapshot.value?.settings.rules ?? 'mcr' })),
    claimRemaining,
    matchOver: computed(() => match.value?.over ?? false),
    readiness: computed((): Readiness | null => {
      const s = snapshot.value
      const m = match.value
      if (!s || !m || m.view?.phase.kind !== 'ended' || m.final) return null
      const ready = s.players.map((slot, p) => m.ready[p]! || slot.name === null || !slot.connected)
      const button = !m.ready[s.you] ? 'ready' : !isHost.value ? 'notReady' : m.allReady ? 'start' : 'waiting'
      return { ready, button }
    }),
    pausedBy: computed(() => (paused.value === null ? null : (playerNames.value[paused.value] ?? null))),
    reactions: reactions.floating,
    speaking: voicePlayer.speaking,
    chat,
    act(action: Action) {
      const m = match.value
      if (m) send('act', { step: m.step, action })
    },
    react(reaction: ReactionId) {
      const s = snapshot.value
      if (!s || !room || !chat.value.reactions || !mayReact()) return
      send('react', { reaction })
      // The server passes it on to everyone else; you see yours straight away.
      reactions.push(s.you, reaction)
    },
    sendVoice(clip: VoiceClip) {
      if (chat.value.voiceChat) send('voice', clip)
    },
    continueToNextHand() {
      send('ready', {})
    },
    unready() {
      send('unready', {})
    },
    deal() {
      send('deal', {})
    },
  }

  return {
    rating,
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
    removedFrom,
    /** Host: remove the player in this seat from the table. */
    kick: (player: number) => send('kick', { player }),
    configure: (settings: Partial<TableSettings>) => send('configure', settings),
    start: () => send('start', {}),
    restart: () => send('restart', {}),
    rematch: (keepScores: boolean) => send('rematch', { keepScores }),
    pause: () => send('pause', {}),
    resume: () => send('resume', {}),
    /** Tell the table about your current name and avatar. */
    sendProfile: () => send('profile', { name: name.value, avatar: avatar.value }),
    /** Player whose voice memo is playing, if any. */
    speaking: voicePlayer.speaking,
    playerNames,
    waitingFor,
  }
}
