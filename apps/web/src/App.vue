<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isRuleSet } from '@mahjong/engine'
import type { Difficulty } from '@mahjong/bots'
import FanReference from './components/FanReference.vue'
import Lobby from './components/Lobby.vue'
import MatchScreen from './components/MatchScreen.vue'
import Onboarding from './components/Onboarding.vue'
import OnlineDialog from './components/OnlineDialog.vue'
import RulesReference from './components/RulesReference.vue'
import { loadLatestVersion } from './game/appUpdate'
import { CLAIM_TIMER_OPTIONS, RULE_OPTIONS, TEXT_SIZE_OPTIONS, useSettings } from './game/settings'
import { useMatch } from './game/useMatch'
import { useOnline } from './game/useOnline'
import { useI18n } from './i18n/useI18n'

const { t, toggle } = useI18n()

/** Fan list dialog: `null` = closed, '' = open at the top, otherwise the fan to show. */
const fanList = ref<string | null>(null)
/** How-to-play dialog. */
const rulesOpen = ref(false)

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

const { claimSeconds, sound, voice, textSize, needsOnboarding, finishOnboarding, rules: preferredRules } = useSettings()
const online = useOnline()
const { snapshot, isHost } = online
/** At an online table (lobby or match); the solo match waits meanwhile. */
const atTable = computed(() => snapshot.value !== null)
const solo = useMatch(atTable)
const { difficulty, rules, resumed, inProgress, startNewMatch } = solo
/** The match on screen. */
const source = computed(() => (atTable.value ? online.source : solo))
const view = computed(() => source.value.view.value)
const shownRules = computed(() => source.value.rules.value)

/** Host / join dialog; opened from the top bar or by an invite link. */
const onlineOpen = ref(false)
const inviteCode = ref<string | undefined>()

async function hostTable() {
  if (await online.host()) onlineOpen.value = false
}
async function joinTable(code: string) {
  if (await online.join(code)) onlineOpen.value = false
}
function leaveTable() {
  if (snapshot.value?.phase === 'lobby' || window.confirm(t('lobby.confirmLeave'))) void online.leave()
}
const pausedBy = computed(() => online.source.pausedBy?.value ?? null)
/** Pausing makes sense while a hand is being played. */
const canPause = computed(() => snapshot.value?.phase === 'playing' && !pausedBy.value && view.value?.phase.kind !== 'ended' && view.value !== null)
const hostName = computed(() => {
  const s = snapshot.value
  return s ? (s.players[s.host]?.name ?? '') : ''
})
/** End of an online match: the host takes everyone back to the lobby; others may leave. */
function onlineMatchDone() {
  if (isHost.value) online.restart()
  else void online.leave()
}

onMounted(() => {
  // Invite link (?room=KJXW): open the join dialog with the code filled in, then tidy the address bar.
  const params = new URLSearchParams(location.search)
  const room = params.get('room')
  if (room) {
    inviteCode.value = room.toUpperCase()
    onlineOpen.value = true
    params.delete('room')
    const rest = params.toString()
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
  } else {
    void online.rejoin()
  }
})

/** Settings dropdown; closes on a click outside it or Escape. */
const settingsMenu = ref<HTMLDetailsElement | null>(null)
function closeSettings(e: Event) {
  const menu = settingsMenu.value
  if (!menu?.open) return
  if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.contains(e.target as Node)) menu.open = false
}
onMounted(() => {
  document.addEventListener('pointerdown', closeSettings)
  document.addEventListener('keydown', closeSettings)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeSettings)
  document.removeEventListener('keydown', closeSettings)
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
    <header class="topbar">
      <h1>
        {{ t('app.title') }} <small>{{ t(`rules.short.${shownRules}`) }}</small>
        <small v-if="snapshot" class="topbar__code">{{ t('lobby.table') }} {{ snapshot.code }}</small>
      </h1>
      <div class="topbar__controls">
        <details ref="settingsMenu" class="menu">
          <summary class="action action--quiet-light">{{ t('app.settings') }}</summary>
          <div class="menu__panel">
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
            <button class="action action--quiet-light" :aria-label="t('app.language')" @click="toggle">{{ t('app.switchLanguage') }}</button>
            <button class="action action--quiet-light" :disabled="updating" @click="loadLatest">{{ updating ? t('app.loadingLatest') : t('app.loadLatest') }}</button>
          </div>
        </details>
        <button class="action action--quiet-light" @click="rulesOpen = true">{{ t('app.howToPlay') }}</button>
        <button class="action action--quiet-light" @click="fanList = ''">{{ t('app.fanReference') }}</button>
        <template v-if="atTable">
          <button v-if="canPause" class="action action--quiet-light" @click="online.pause">{{ t('online.pause') }}</button>
          <button class="action" @click="leaveTable">{{ t('lobby.leave') }}</button>
        </template>
        <template v-else>
          <button class="action action--quiet-light" @click="onlineOpen = true">{{ t('online.open') }}</button>
          <button class="action" @click="confirmNewMatch">{{ t('app.newMatch') }}</button>
        </template>
      </div>
    </header>

    <Lobby
      v-if="snapshot?.phase === 'lobby'"
      v-model:name="online.name.value"
      :snapshot="snapshot"
      :is-host="isHost"
      @configure="online.configure"
      @start="online.start"
      @rename="online.rename"
      @leave="leaveTable"
    />
    <MatchScreen
      v-else-if="atTable"
      :key="`online:${snapshot!.code}`"
      :source="online.source"
      @new-match="onlineMatchDone"
      @explain="(id: string) => (fanList = id)"
    >
      <template #matchEnd>
        <div v-if="isHost" class="summary__choices">
          <button class="action action--primary summary__continue" autofocus @click="online.rematch">{{ t('online.keepGoing') }}</button>
          <button class="action summary__continue" @click="online.restart">{{ t('online.backToLobby') }}</button>
        </div>
        <template v-else>
          <p class="result__note">{{ t('online.waitingHostChoice', { name: hostName }) }}</p>
          <button class="action summary__continue" @click="leaveTable">{{ t('online.leaveMatch') }}</button>
        </template>
      </template>
    </MatchScreen>

    <MatchScreen v-else :source="solo" @new-match="startNewMatch()" @explain="(id: string) => (fanList = id)" />

    <!-- A break: everyone at the online table sees this until someone resumes. -->
    <div v-if="pausedBy" class="result" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div class="result__card pause">
        <h2 id="pause-title">{{ t('pause.title') }}</h2>
        <p>{{ t('pause.by', { name: pausedBy }) }}</p>
        <p class="result__note">{{ t('pause.hint') }}</p>
        <button class="action action--primary" autofocus @click="online.resume">{{ t('pause.resume') }}</button>
      </div>
    </div>

    <RulesReference v-if="rulesOpen" :rules="shownRules" @close="rulesOpen = false" @fans="rulesOpen = false; fanList = ''" />
    <FanReference v-if="fanList !== null" :focus="fanList || null" :rules="shownRules" @close="fanList = null" />

    <Onboarding v-if="needsOnboarding" @done="onboardingDone" />

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
    <p v-if="!atTable && online.error.value === 'lost'" class="online__error online__error--banner" role="alert">{{ t('online.error.lost') }}</p>
  </main>
</template>
