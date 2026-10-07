<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isRuleSet } from '@mahjong/engine'
import type { Difficulty } from '@mahjong/bots'
import FeedbackDialog from './components/FeedbackDialog.vue'
import FriendsDialog from './components/FriendsDialog.vue'
import MenuIcon from './components/MenuIcon.vue'
import Lobby from './components/Lobby.vue'
import MatchScreen from './components/MatchScreen.vue'
import Onboarding from './components/Onboarding.vue'
import OnlineDialog from './components/OnlineDialog.vue'
import PlayerCard from './components/PlayerCard.vue'
import ProfilePage from './components/ProfilePage.vue'
import RulesDialog, { type RulesTab } from './components/RulesDialog.vue'
import ToastStack from './components/ToastStack.vue'
import { track } from './game/analytics'
import { loadLatestVersion } from './game/appUpdate'
import { friendsCount, parseFriendCode, seatChanges } from './game/friends'
import { signed } from './game/stats'
import { useInstall } from './game/install'
import { shareInvite } from './game/invite'
import { CLAIM_TIMER_OPTIONS, RULE_OPTIONS, TEXT_SIZE_OPTIONS, useSettings } from './game/settings'
import { useMatch } from './game/useMatch'
import { useOnline } from './game/useOnline'
import { useProfile } from './game/profile'
import { useAccount } from './game/useAccount'
import { useSocial } from './game/useSocial'
import { useToasts } from './game/useToasts'
import { useI18n } from './i18n/useI18n'

/** Address hash while the profile page is open, so the browser's Back button closes it. */
const PROFILE_HASH = '#profile'

const { t, toggle, locale } = useI18n()

/** Rules dialog (how to play + fan list tabs); `focus` is the fan to show on the fan list. */
const rulesDialog = ref<{ tab: RulesTab; focus?: string } | null>(null)

const LEVELS: Difficulty[] = ['beginner', 'easy', 'medium', 'hard']

const { claimSeconds, sound, voice, textSize, needsOnboarding, finishOnboarding, rules: preferredRules } = useSettings()
const online = useOnline()
const { snapshot, isHost, link } = online
/** At an online table (lobby or match); the solo match waits meanwhile. */
const atTable = computed(() => snapshot.value !== null)
/** Your profile page (name, face, stats, history, leaderboards); opened by clicking your own badge or seat, or the account button. */
const profileOpen = ref(location.hash === PROFILE_HASH)
// Solo play waits while you are at an online table or looking at your profile.
const solo = useMatch(computed(() => atTable.value || profileOpen.value))
const { difficulty, rules, resumed, inProgress, startNewMatch, keepGoing } = solo
/** The match on screen. */
const source = computed(() => (atTable.value ? online.source : solo))
const view = computed(() => source.value.view.value)
const shownRules = computed(() => source.value.rules.value)

function openProfile() {
  if (profileOpen.value) return
  profileOpen.value = true
  history.pushState(null, '', `${location.pathname}${location.search}${PROFILE_HASH}`)
}
function closeProfile() {
  if (!profileOpen.value) return
  profileOpen.value = false
  if (location.hash === PROFILE_HASH) history.back()
}
function onPopState() {
  profileOpen.value = location.hash === PROFILE_HASH
}
onMounted(() => window.addEventListener('popstate', onPopState))
onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))

/** A changed profile reaches the online table and your account straight away. */
function profileSaved() {
  if (atTable.value) online.sendProfile()
  if (account.signedIn.value) social.saveProfile()
}

/** Optional accounts and friends; everything above works without them. */
const account = useAccount()
const social = useSocial()
const friendsOpen = ref(false)
const friendsLabel = computed(() => {
  if (!account.signedIn.value || !social.friends.value) return t('friends.open')
  const { key, n } = friendsCount(social.friends.value.friends)
  return t(key, { n })
})
const onlineFriends = computed(() => social.friends.value?.friends.some((f) => f.state === 'friend' && f.online) ?? false)
const incomingRequests = computed(() => social.friends.value?.friends.filter((f) => f.state === 'incoming').length ?? 0)

/** Another player's card at an online table (by player index), to add them as a friend. */
const playerCard = ref<number | null>(null)
const cardSlot = computed(() => (playerCard.value === null ? null : (snapshot.value?.players[playerCard.value] ?? null)))

/** Short messages at the bottom of the screen, e.g. after opening a friend invite link. */
const toasts = useToasts()
const showNotice = (text: string) => void toasts.push({ text })
watch(social.inviteResult, (r) => {
  if (!r) return
  if (r.ok) showNotice(t('friends.nowFriends', { name: r.name }))
  else showNotice(t(r.error === 'self' ? 'friends.inviteOwn' : r.error === 'limit' ? 'friends.limit' : 'friends.inviteUnknown'))
  social.inviteResult.value = null
})
watch(social.lastError, (e) => {
  if (e === 'limit') showNotice(t('friends.limit'))
  social.lastError.value = null
})

/** Host / join dialog; opened from the top bar or by an invite link. */
const onlineOpen = ref(false)
const inviteCode = ref<string | undefined>()

async function hostTable() {
  if (await online.host()) onlineOpen.value = false
}
async function joinTable(code: string) {
  if (await online.join(code, true)) onlineOpen.value = false
}

/** Sign-in players can invite friends to the table they are at. */
const canInviteFriends = computed(() => account.signedIn.value && social.connected.value)

/** Join a friend's table from an invite or the friends list, leaving yours first if you agree. */
async function joinFriendTable(code: string) {
  const current = snapshot.value?.code ?? null
  if (current === code) return
  if (current !== null && !window.confirm(t('tableInvite.confirmSwitch', { code }))) return
  friendsOpen.value = false
  if (current !== null) await online.leave()
  if (!(await online.join(code, true))) {
    const error = online.error.value
    showNotice(error ? `${t('tableInvite.joinFailed', { code })} ${t(`online.error.${error}`)}` : t('tableInvite.joinFailed', { code }))
  }
}

/** From solo: host a new table and ask a friend to it in one go. */
async function playWithFriend(userId: string) {
  friendsOpen.value = false
  if (atTable.value) return
  // Use the code from hosting itself: the table's first snapshot may not have arrived yet.
  const code = await online.host()
  if (!code) {
    const error = online.error.value
    if (error) showNotice(t(`online.error.${error}`))
    return
  }
  social.inviteWhenSeated(userId, code)
}

/** Host: remove a player from the table, after checking. */
function removePlayer(p: number) {
  const name = online.playerNames.value[p] ?? snapshot.value?.players[p]?.name ?? ''
  if (!window.confirm(t('lobby.confirmRemove', { name }))) return
  online.kick(p)
  playerCard.value = null
}
watch(online.removedFrom, (code) => {
  if (!code) return
  toasts.push({ text: t('toast.removed', { code }), sticky: true })
  online.removedFrom.value = null
})

const inviteKey = (code: string) => `table-invite:${code}`
social.on('tableInvite', (invite) => {
  if (snapshot.value?.code === invite.code) return
  toasts.push({
    key: inviteKey(invite.code),
    text: t('tableInvite.received', { name: invite.from.name, code: invite.code }),
    sticky: true,
    actions: [{ label: t('friends.join'), primary: true, run: () => void joinFriendTable(invite.code) }],
  })
})
social.on('tableInviteResult', (r) => {
  const name = r.name ?? ''
  showNotice(r.ok ? t('tableInvite.sent', { name }) : t(`tableInvite.error.${r.error}`, { name }))
})
social.on('friendRequest', (f) => {
  toasts.push({
    key: `friend-request:${f.userId}`,
    text: t('toast.friendRequest', { name: f.name }),
    sticky: true,
    actions: [{ label: t('friends.accept'), primary: true, run: () => social.respond(f.userId, true) }],
  })
})

/** Friends sitting down at or leaving your table get a passing mention. */
let seated: { code: string; users: Set<string> } | null = null
watch(snapshot, (s) => {
  if (!s) return void (seated = null)
  // Invites to the table you are now at are done with.
  toasts.dismissKey(inviteKey(s.code))
  const users = new Set(s.players.flatMap((p, i) => (p.userId && i !== s.you ? [p.userId] : [])))
  const before = seated?.code === s.code ? seated.users : null
  seated = { code: s.code, users }
  if (!before) return
  const friends = new Map((social.friends.value?.friends ?? []).filter((f) => f.state === 'friend').map((f) => [f.userId, f.name]))
  const { joined, left } = seatChanges(before, users)
  for (const id of joined) if (friends.has(id)) showNotice(t('toast.friendJoined', { name: friends.get(id)! }))
  for (const id of left) if (friends.has(id)) showNotice(t('toast.friendLeft', { name: friends.get(id)! }))
})
function leaveTable() {
  if (snapshot.value?.phase === 'lobby' || window.confirm(t('lobby.confirmLeave'))) void online.leave()
}
/** Lost the table: go solo on the player's say-so, without the leave-table confirmation. */
const playSolo = () => void online.leave()
/** The table chip in the top bar shares the invite link, like the lobby's share button. */
const codeCopied = ref(false)
async function shareTable() {
  if (!snapshot.value || (await shareInvite(snapshot.value.code, t)) !== 'copied') return
  codeCopied.value = true
  setTimeout(() => (codeCopied.value = false), 2000)
}
const pausedBy = computed(() => online.source.pausedBy?.value ?? null)
/** On a break: someone paused the online table, or you paused your solo match. */
const onBreak = computed(() => (atTable.value ? pausedBy.value !== null : solo.onBreak.value))
/** Pausing makes sense while a hand is being played. */
const canPause = computed(() => {
  if (onBreak.value || !view.value || view.value.phase.kind === 'ended') return false
  return atTable.value ? snapshot.value?.phase === 'playing' : !needsOnboarding.value
})
const pause = () => (atTable.value ? online.pause() : solo.pause())
const resume = () => (atTable.value ? online.resume() : solo.resume())
const hostName = computed(() => {
  const s = snapshot.value
  return s ? (s.players[s.host]?.name ?? '') : ''
})
/** End of an online match: the host takes everyone back to the lobby; others may leave. */
function onlineMatchDone() {
  if (isHost.value) online.restart()
  else void online.leave()
}

onMounted(async () => {
  // Back from Logto's sign-in page, or a saved session: settles who the player is (guests: instantly).
  await account.init()
  social.start()
  const params = new URLSearchParams(location.search)
  // Friend invite link (?friend=code): befriend its owner now, or once signed in.
  const friendCode = parseFriendCode(params.get('friend'))
  if (params.has('friend')) params.delete('friend')
  if (friendCode && account.enabled) {
    social.openInvite(friendCode)
    if (!account.signedIn.value) friendsOpen.value = true
  }
  // Invite link (?room=KJXW): open the join dialog with the code filled in, then tidy the address bar.
  const room = params.get('room')
  if (room) {
    inviteCode.value = room.toUpperCase()
    onlineOpen.value = true
    params.delete('room')
  } else {
    void online.rejoin()
  }
  const rest = params.toString()
  if (rest !== location.search.slice(1)) history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
})

/**
 * The top bar is the title on the left and a toggle on the right that drops down every control
 * (with Friends beside it on wider screens). On phones the title opens the menu too.
 */
const narrowQuery = window.matchMedia('(max-width: 640px)')
const narrow = ref(narrowQuery.matches)
const navOpen = ref(false)
function onNarrowChange() {
  narrow.value = narrowQuery.matches
  navOpen.value = false
}
/** Picking an action closes the menu. */
function closeNavAfterAction(e: Event) {
  if ((e.target as Element).closest('button')) navOpen.value = false
}

/** The menu closes on a click outside it or Escape; the settings dialog on Escape. */
const topbar = ref<HTMLElement | null>(null)
const settingsOpen = ref(false)
/** From Settings, the difficulty explainer opens in place of the dialog. */
function showDifficulty() {
  settingsOpen.value = false
  rulesDialog.value = { tab: 'difficulty' }
}
function closeMenus(e: Event) {
  const escape = e instanceof KeyboardEvent && e.key === 'Escape'
  if (escape && settingsOpen.value) settingsOpen.value = false
  else if (navOpen.value && (e instanceof KeyboardEvent ? escape : !topbar.value?.contains(e.target as Node))) navOpen.value = false
}
onMounted(() => {
  document.addEventListener('pointerdown', closeMenus)
  document.addEventListener('keydown', closeMenus)
  narrowQuery.addEventListener('change', onNarrowChange)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeMenus)
  document.removeEventListener('keydown', closeMenus)
  narrowQuery.removeEventListener('change', onNarrowChange)
})

function confirmNewMatch() {
  if (!inProgress() || window.confirm(t('app.confirmNewMatch'))) startNewMatch()
}

/**
 * First visit: deal again under the chosen rules. A match restored from an older
 * version is only abandoned if the player agrees.
 */
function onboardingDone() {
  const next = preferredRules.value
  finishOnboarding()
  track('onboarding_finished')
  if (next === rules.value) return
  if (!resumed || !inProgress() || window.confirm(t('app.confirmRules'))) startNewMatch(next)
  else preferredRules.value = rules.value
}

/** Switching rules starts a new match, after confirming if one is under way. */
function changeRules(e: Event) {
  const select = e.target as HTMLSelectElement
  const next = select.value
  if (isRuleSet(next) && next !== rules.value && (!inProgress() || window.confirm(t('app.confirmRules')))) startNewMatch(next)
  else select.value = rules.value
}

/** Feedback form; what it attaches is captured when it opens. */
const feedbackOpen = ref(false)
const profile = useProfile()
/** Settings and whereabouts for the report, plus the game: all of it at a solo table, your view (and code) online. */
function captureFeedback() {
  const s = snapshot.value
  const app = {
    locale: locale.value,
    profile: { name: profile.name.value, avatar: profile.avatar.value },
    settings: {
      rules: preferredRules.value,
      difficulty: difficulty.value,
      claimSeconds: claimSeconds.value,
      sound: sound.value,
      voice: voice.value,
      textSize: textSize.value,
    },
    screen: atTable.value ? `online ${s?.phase}` : 'solo',
    onBreak: onBreak.value,
    link: link.value,
    onlineError: online.error.value,
    needsOnboarding: needsOnboarding.value,
  }
  if (s) {
    // The seat token is a password for the seat; everything else the player could see goes along.
    const { token: _token, ...seen } = s
    return { app, game: { mode: 'online', snapshot: seen }, tableCode: s.code }
  }
  return { app, game: { mode: 'solo', difficulty: difficulty.value, ...solo.debugState() } }
}

/** Install as an app; iOS has no prompt, so explain the Share menu route instead. */
const { canInstall, install } = useInstall()
async function installApp() {
  if (!(await install())) window.alert(t('app.installIos'))
}

/** Reload onto the newest deploy (installed PWAs can otherwise linger on an old build). */
const updating = ref(false)
async function loadLatest() {
  updating.value = true
  if (!(await loadLatestVersion())) {
    updating.value = false
    window.alert(t('app.loadLatestOffline'))
  }
}
</script>

<template>
  <main class="app">
    <header ref="topbar" class="topbar" :class="{ 'topbar--narrow': narrow, 'topbar--open': navOpen }">
      <h1>
        <button
          v-if="narrow"
          type="button"
          class="topbar__title"
          :aria-expanded="navOpen"
          aria-controls="topbar-controls"
          @click="navOpen = !navOpen"
        >
          <img class="topbar__logo" src="/icon.svg" alt="" width="32" height="32" />
          {{ t('app.title') }} <small>{{ t(`rules.short.${shownRules}`) }}</small>
        </button>
        <template v-else>
          <img class="topbar__logo" src="/icon.svg" alt="" width="32" height="32" />
          {{ t('app.title') }} <small>{{ t(`rules.short.${shownRules}`) }}</small>
        </template>
        <button
          v-if="snapshot"
          type="button"
          class="topbar__code"
          :title="codeCopied ? t('lobby.copied') : t('lobby.share')"
          :aria-label="`${t('lobby.table')} ${snapshot.code}: ${codeCopied ? t('lobby.copied') : t('lobby.share')}`"
          @click="shareTable"
        >
          {{ t('lobby.table') }} {{ snapshot.code }}
          <svg class="topbar__share" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
      </h1>
      <div class="topbar__end">
        <button v-if="!narrow && account.enabled" class="action action--quiet-light" @click="friendsOpen = true">
          <MenuIcon name="friends" /><span v-if="onlineFriends" class="topbar__online" aria-hidden="true" />{{ friendsLabel }}
          <span v-if="incomingRequests" class="topbar__badge" :aria-label="t('friends.requestsWaiting', { n: incomingRequests })">{{ incomingRequests }}</span>
        </button>
        <button
          v-if="!narrow"
          type="button"
          class="action action--quiet-light topbar__menu"
          :aria-expanded="navOpen"
          aria-controls="topbar-controls"
          @click="navOpen = !navOpen"
        >
          <MenuIcon name="menu" />{{ t('app.menu') }}
        </button>
        <button
          v-else
          type="button"
          class="topbar__toggle"
          :aria-label="t('app.menu')"
          :aria-expanded="navOpen"
          aria-controls="topbar-controls"
          @click="navOpen = !navOpen"
        >
          <svg class="topbar__chevron" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div v-show="navOpen" id="topbar-controls" class="topbar__controls" @click="closeNavAfterAction">
        <div class="topbar__group">
          <template v-if="atTable">
            <button class="action" @click="leaveTable"><MenuIcon name="leave" />{{ t('lobby.leave') }}</button>
            <button v-if="canInviteFriends" class="action action--quiet-light" @click="friendsOpen = true"><MenuIcon name="friends" />{{ t('tableInvite.button') }}</button>
          </template>
          <template v-else>
            <button class="action" @click="confirmNewMatch"><MenuIcon name="newMatch" />{{ t('app.newMatch') }}</button>
            <button class="action action--quiet-light" @click="onlineOpen = true"><MenuIcon name="online" />{{ t('online.open') }}</button>
          </template>
          <button v-if="canPause" class="action action--quiet-light" @click="pause"><MenuIcon name="pause" />{{ t('online.pause') }}</button>
        </div>
        <div v-if="account.enabled" class="topbar__group">
          <button class="action action--quiet-light" @click="friendsOpen = true">
            <MenuIcon name="friends" /><span v-if="onlineFriends" class="topbar__online" aria-hidden="true" />{{ friendsLabel }}
            <span v-if="incomingRequests" class="topbar__badge" :aria-label="t('friends.requestsWaiting', { n: incomingRequests })">{{ incomingRequests }}</span>
          </button>
          <button v-if="account.ready.value && !account.signedIn.value" class="action action--quiet-light" @click="account.signIn()"><MenuIcon name="signIn" />{{ t('account.signIn') }}</button>
          <button v-else-if="account.signedIn.value" class="action action--quiet-light" @click="openProfile()"><MenuIcon name="account" />{{ t('account.open') }}</button>
        </div>
        <div class="topbar__group">
          <button class="action action--quiet-light" @click="settingsOpen = true"><MenuIcon name="settings" />{{ t('app.settings') }}</button>
          <button class="action action--quiet-light" @click="rulesDialog = { tab: 'rules' }"><MenuIcon name="rules" />{{ t('app.howToPlay') }}</button>
          <button class="action action--quiet-light" @click="feedbackOpen = true"><MenuIcon name="feedback" />{{ t('feedback.open') }}</button>
          <button v-if="canInstall" class="action action--quiet-light" @click="installApp"><MenuIcon name="install" />{{ t('app.install') }}</button>
        </div>
      </div>
    </header>

    <Lobby
      v-if="snapshot?.phase === 'lobby'"
      :snapshot="snapshot"
      :is-host="isHost"
      :can-invite-friends="canInviteFriends"
      @configure="online.configure"
      @start="online.start"
      @edit-profile="openProfile()"
      @open-player="(p: number) => (playerCard = p)"
      @invite-friends="friendsOpen = true"
      @remove="removePlayer"
      @leave="leaveTable"
    />
    <MatchScreen
      v-else-if="atTable"
      :key="`online:${snapshot!.code}`"
      :source="online.source"
      :openable="true"
      @new-match="onlineMatchDone"
      @explain="(id: string) => (rulesDialog = { tab: 'fans', focus: id })"
      @edit-profile="openProfile()"
      @open-player="(p: number) => (playerCard = p)"
    >
      <template #matchEnd>
        <div v-if="isHost" class="summary__choices">
          <button class="action action--primary summary__continue" autofocus @click="online.rematch(true)">{{ t('result.keepGoing') }}</button>
          <button class="action summary__continue" @click="online.rematch(false)">{{ t('result.newMatch') }}</button>
          <button class="action summary__continue" @click="online.restart">{{ t('online.backToLobby') }}</button>
        </div>
        <p v-if="online.rating.value" class="summary__rating">
          {{ t('rating.change', { before: online.rating.value.before, after: online.rating.value.after, change: signed(online.rating.value.after - online.rating.value.before) }) }}
        </p>
        <template v-if="!isHost">
          <p class="result__note">{{ t('online.waitingHostChoice', { name: hostName }) }}</p>
          <button class="action summary__continue" @click="leaveTable">{{ t('online.leaveMatch') }}</button>
        </template>
      </template>
    </MatchScreen>

    <MatchScreen
      v-else
      :source="solo"
      @new-match="startNewMatch()"
      @keep-going="keepGoing()"
      @explain="(id: string) => (rulesDialog = { tab: 'fans', focus: id })"
      @edit-profile="openProfile()"
    />

    <!-- A break: everyone at the online table sees this until someone resumes. -->
    <div v-if="onBreak && link === 'up'" class="result" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div class="result__card pause">
        <h2 id="pause-title">{{ t('pause.title') }}</h2>
        <template v-if="atTable">
          <p>{{ t('pause.by', { name: pausedBy ?? '' }) }}</p>
          <p class="result__note">{{ t('pause.hint') }}</p>
        </template>
        <p v-else class="result__note">{{ t('pause.solo') }}</p>
        <button class="action action--primary" autofocus @click="resume">{{ t('pause.resume') }}</button>
      </div>
    </div>

    <!-- Lost the connection to the online table: wait for it to come back, retry, or go solo. -->
    <div v-if="atTable && link !== 'up'" class="result" role="alertdialog" aria-modal="true" aria-labelledby="link-title" aria-describedby="link-body">
      <div class="result__card pause">
        <h2 id="link-title">{{ t(link === 'lost' ? 'link.lostTitle' : 'link.reconnectingTitle') }}</h2>
        <p id="link-body">{{ t(link === 'lost' ? 'link.lost' : 'link.reconnecting', { code: snapshot!.code }) }}</p>
        <p v-if="link === 'lost' && online.error.value" class="online__error" role="alert">
          {{ t(online.error.value === 'notFound' ? 'link.closed' : `online.error.${online.error.value}`) }}
        </p>
        <p class="result__note">{{ t('link.seatHint') }}</p>
        <div class="summary__choices">
          <button class="action action--primary" :disabled="link === 'reconnecting'" autofocus @click="online.reconnect">
            {{ link === 'reconnecting' ? t('online.connecting') : t('link.reconnect') }}
          </button>
          <button class="action" @click="playSolo">{{ t('link.solo') }}</button>
        </div>
      </div>
    </div>

    <RulesDialog v-if="rulesDialog" :tab="rulesDialog.tab" :focus="rulesDialog.focus" :rules="shownRules" @close="rulesDialog = null" />

    <Onboarding v-if="needsOnboarding" @done="onboardingDone" />

    <FeedbackDialog v-if="feedbackOpen" :capture="captureFeedback" @close="feedbackOpen = false" />

    <ProfilePage v-if="profileOpen" @save="profileSaved" @close="closeProfile" />

    <div v-if="settingsOpen" class="result" role="dialog" aria-modal="true" aria-labelledby="settings-title" @click.self="settingsOpen = false">
      <div class="result__card settings">
        <h2 id="settings-title">{{ t('app.settings') }}</h2>
        <div class="settings__list">
          <label v-if="!atTable" class="select">
            <span>{{ t('app.rules') }}</span>
            <select :value="rules" :aria-label="t('app.rules')" @change="changeRules">
              <option v-for="r in RULE_OPTIONS" :key="r.id" :value="r.id" :disabled="!r.playable">
                {{ r.playable ? t(`rules.${r.id}`) : t('rules.comingSoon', { name: t(`rules.${r.id}`) }) }}
              </option>
            </select>
          </label>
          <label v-if="!atTable" class="select">
            <span>{{ t('app.bots') }}</span>
            <select v-model="difficulty" :aria-label="t('app.botDifficulty')">
              <option v-for="l in LEVELS" :key="l" :value="l">{{ t(`level.${l}`) }}</option>
            </select>
          </label>
          <button v-if="!atTable" type="button" class="linklike settings__help" @click="showDifficulty">{{ t('difficulty.explain') }}</button>
          <label v-if="!atTable" class="select">
            <span>{{ t('app.claimTimer') }}</span>
            <select v-model.number="claimSeconds" :aria-label="t('app.claimTimer')">
              <option v-for="s in CLAIM_TIMER_OPTIONS" :key="s" :value="s">{{ s === 0 ? t('timer.off') : t('timer.seconds', { n: s }) }}</option>
            </select>
          </label>
          <label class="select">
            <span>{{ t('app.textSize') }}</span>
            <select v-model="textSize" :aria-label="t('app.textSize')">
              <option v-for="s in TEXT_SIZE_OPTIONS" :key="s" :value="s">{{ t(`textSize.${s}`) }}</option>
            </select>
          </label>
          <label class="select toggle">
            <span class="toggle__label">
              <svg class="toggle__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                <template v-if="sound">
                  <path d="M16 9a4 4 0 0 1 0 6" />
                  <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
                </template>
                <path v-else d="M16 9l5 6M21 9l-5 6" />
              </svg>
              {{ t('app.sound') }}
            </span>
            <input v-model="sound" class="toggle__input" type="checkbox" role="switch" />
          </label>
          <label class="select toggle">
            <span class="toggle__label">
              <svg class="toggle__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" :fill="voice ? 'currentColor' : 'none'" />
              </svg>
              {{ t('app.voice') }}
            </span>
            <input v-model="voice" class="toggle__input" type="checkbox" role="switch" />
          </label>
          <div class="settings__more">
            <button class="action action--quiet-light" :aria-label="t('app.language')" @click="toggle"><MenuIcon name="language" />{{ t('app.switchLanguage') }}</button>
            <button class="action action--quiet-light" :disabled="updating" @click="loadLatest"><MenuIcon name="loadLatest" />{{ updating ? t('app.loadingLatest') : t('app.loadLatest') }}</button>
          </div>
        </div>
        <div class="profile__buttons">
          <button type="button" class="action action--primary" @click="settingsOpen = false">{{ t('app.done') }}</button>
        </div>
      </div>
    </div>
    <FriendsDialog v-if="friendsOpen" :table-code="snapshot?.code ?? null" @join="joinFriendTable" @play-with="playWithFriend" @close="friendsOpen = false" />

    <PlayerCard
      v-if="cardSlot && playerCard !== null"
      :name="online.playerNames.value[playerCard] ?? ''"
      :avatar="cardSlot.avatar"
      :user-id="cardSlot.userId"
      :bot="cardSlot.name === null"
      :can-remove="isHost && cardSlot.name !== null && playerCard !== snapshot?.you"
      @remove="removePlayer(playerCard)"
      @close="playerCard = null"
    />

    <ToastStack />

    <OnlineDialog
      v-if="onlineOpen && !atTable"
      v-model:name="online.name.value"
      :busy="online.busy.value"
      :error="online.error.value"
      :initial-code="inviteCode"
      @host="hostTable"
      @join="joinTable"
      @close="onlineOpen = false"
    />

    <section v-if="!view && snapshot?.phase !== 'lobby'" class="result__card result__card--inline">
      <h2>{{ t('app.matchFinished') }}</h2>
      <button v-if="atTable" class="action action--primary" @click="onlineMatchDone">
        {{ isHost ? t('online.backToLobby') : t('online.leaveMatch') }}
      </button>
      <button v-else class="action action--primary" @click="startNewMatch()">{{ t('app.newMatch') }}</button>
    </section>
  </main>
</template>
