import { computed, ref, shallowRef, watch } from 'vue'
import { Client, type Room } from '@colyseus/sdk'
import {
  SOCIAL_ROOM,
  type Friend,
  type FriendError,
  type FriendsSnapshot,
  type InviteResult,
  type SocialClientMessages,
  type SocialJoinOptions,
  type TableInvite,
  type TableInviteResult,
} from '@mahjong/protocol'
import { useAccount } from './useAccount'
import { useProfile } from './profile'
import { SERVER_URL } from './serverUrl'

/** An invite link opened while signed out, finished once the player has signed in. */
const PENDING_INVITE_KEY = 'mahjong.friendInvite'
/** Retry a lost connection after this long, doubling up to the cap. */
const RETRY_MS = 3_000
const MAX_RETRY_MS = 60_000

const friends = shallowRef<FriendsSnapshot | null>(null)
/** Outcome of the last invite link, for a one-off notice. */
const inviteResult = shallowRef<InviteResult | null>(null)
const lastError = ref<FriendError | null>(null)
let room: Room | null = null
/** Who had asked to be friends as of the last list since connecting; null until the first one. */
let seenIncoming: Set<string> | null = null

/** One-off happenings on the social connection, for toasts. */
type SocialEvents = { tableInvite: TableInvite; tableInviteResult: TableInviteResult; friendRequest: Friend }
const listeners: { [K in keyof SocialEvents]: Set<(e: SocialEvents[K]) => void> } = {
  tableInvite: new Set(),
  tableInviteResult: new Set(),
  friendRequest: new Set(),
}
function emit<K extends keyof SocialEvents>(type: K, event: SocialEvents[K]): void {
  for (const fn of listeners[type]) fn(event)
}
let started = false
let retryMs = RETRY_MS
let retryTimer: ReturnType<typeof setTimeout> | undefined
/** Bumped on disconnect so a connection still being opened is dropped. */
let generation = 0

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

function writePending(code: string | null): void {
  try {
    if (code === null) sessionStorage.removeItem(PENDING_INVITE_KEY)
    else sessionStorage.setItem(PENDING_INVITE_KEY, code)
  } catch {
    // No session storage: the invite only works if the player is already signed in.
  }
}

function send<K extends keyof SocialClientMessages>(type: K, message: SocialClientMessages[K]): void {
  room?.send(type, message)
}

/**
 * Signed-in players keep one connection to the game server's social room while the game is open.
 * It is how friends see you online, and it pushes your friends list whenever anything changes.
 */
export function useSocial() {
  const account = useAccount()
  const profile = useProfile()

  async function connect(): Promise<void> {
    clearTimeout(retryTimer)
    const started = ++generation
    const accessToken = await account.accessToken()
    if (started !== generation) return
    // Signed in but no token (offline, auth server down): try again later.
    if (!accessToken) return retry()
    const options: SocialJoinOptions = { accessToken, name: profile.name.value.trim() || undefined, avatar: profile.avatar.value }
    try {
      const r = await new Client(SERVER_URL).joinOrCreate(SOCIAL_ROOM, options)
      if (started !== generation) return void r.leave()
      room = r
      retryMs = RETRY_MS
      seenIncoming = null
      r.onMessage('friends', (s: FriendsSnapshot) => {
        friends.value = s
        // New requests since the last list; ones already waiting when we connected are just badged.
        const incoming = s.friends.filter((f) => f.state === 'incoming')
        if (seenIncoming) for (const f of incoming) if (!seenIncoming.has(f.userId)) emit('friendRequest', f)
        seenIncoming = new Set(incoming.map((f) => f.userId))
        // The account's name and face follow the player to every device.
        profile.name.value = s.me.name
        if (s.me.avatar !== null) profile.avatar.value = s.me.avatar
      })
      r.onMessage('inviteResult', (result: InviteResult) => (inviteResult.value = result))
      r.onMessage('friendError', (error: FriendError) => (lastError.value = error))
      r.onMessage('tableInvite', (invite: TableInvite) => emit('tableInvite', invite))
      r.onMessage('tableInviteResult', (result: TableInviteResult) => emit('tableInviteResult', result))
      r.onLeave(() => {
        if (room !== r) return
        room = null
        retry()
      })
      const pending = readPending()
      if (pending) {
        writePending(null)
        send('acceptInvite', { code: pending })
      }
    } catch (error) {
      console.warn('friends: could not connect', error)
      retry()
    }
  }

  function retry(): void {
    if (!account.signedIn.value) return
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => void connect(), retryMs)
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
  }

  function disconnect(): void {
    generation++
    clearTimeout(retryTimer)
    const r = room
    room = null
    friends.value = null
    void r?.leave().catch(() => {})
  }

  /** Begin following the account: connected while signed in, gone when signed out. Idempotent. */
  function start(): void {
    if (started) return
    started = true
    watch(account.signedIn, (on) => (on ? void connect() : disconnect()), { immediate: true })
  }

  /** Opened someone's friend invite link: befriend them now, or right after signing in. */
  function openInvite(code: string): void {
    if (room) send('acceptInvite', { code })
    else writePending(code)
  }

  return {
    friends,
    connected: computed(() => friends.value !== null),
    inviteResult,
    lastError,
    start,
    openInvite,
    request: (userId: string) => send('friendRequest', { userId }),
    respond: (userId: string, accept: boolean) => send('friendRespond', { userId, accept }),
    remove: (userId: string) => send('friendRemove', { userId }),
    /** Ask an online friend to the table you are at. */
    inviteToTable: (userId: string, code: string) => send('tableInvite', { userId, code }),
    /** Listen for one-off happenings: an invite to a table, how your invite went, a new friend request. */
    on<K extends keyof SocialEvents>(type: K, fn: (e: SocialEvents[K]) => void): () => void {
      listeners[type].add(fn)
      return () => listeners[type].delete(fn)
    },
    /** Save your name and face to your account. */
    saveProfile: () => send('profile', { name: profile.name.value, avatar: profile.avatar.value }),
  }
}
