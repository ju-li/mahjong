<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MAX_NAME_LENGTH } from '@mahjong/protocol'
import HistoryTab from './HistoryTab.vue'
import LeaderboardTab from './LeaderboardTab.vue'
import StatsTab from './StatsTab.vue'
import AvatarPicker from './AvatarPicker.vue'
import { avatarSvg } from '../game/avatar'
import { tidyName, useProfile } from '../game/profile'
import { useAccount } from '../game/useAccount'
import { useI18n } from '../i18n/useI18n'

/**
 * Your page: name, face and account up top, then your stats, match history and the leaderboards.
 * Shown over the table (which keeps its state underneath); Back or Escape closes it.
 */
const emit = defineEmits<{ save: []; close: [] }>()

const { t } = useI18n()
const profile = useProfile()
const account = useAccount()

// ---- Name and face (changes apply on Save) ----
const draftName = ref(profile.name.value)
const picked = ref(profile.avatar.value)
const dirty = computed(() => tidyName(draftName.value) !== profile.name.value.trim() || picked.value !== profile.avatar.value)
const saved = ref(false)

function save() {
  profile.name.value = tidyName(draftName.value)
  profile.avatar.value = picked.value
  emit('save')
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}

// ---- Tabs ----
const TABS = ['stats', 'history', 'leaderboards'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'mahjong.profileTab'
function readTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY)
    return TABS.includes(t as Tab) ? (t as Tab) : 'stats'
  } catch {
    return 'stats'
  }
}
const tab = ref<Tab>(readTab())
const tabEls = ref<HTMLButtonElement[]>([])
function select(next: Tab, focus = false) {
  tab.value = next
  try {
    localStorage.setItem(TAB_KEY, next)
  } catch {
    // Remembering the tab is a nicety.
  }
  if (focus) tabEls.value[TABS.indexOf(next)]?.focus()
}
/** Arrow keys move between tabs, as in any tablist. */
function onTabKey(e: KeyboardEvent) {
  const i = TABS.indexOf(tab.value)
  const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
  if (next < 0) return
  e.preventDefault()
  select(TABS[next]!, true)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
const page = ref<HTMLElement | null>(null)
onMounted(() => {
  window.addEventListener('keydown', onKey)
  page.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section ref="page" class="profile-page" tabindex="-1" aria-labelledby="profile-title">
    <div class="profile-page__inner">
      <div class="profile-page__bar">
        <button class="action" @click="emit('close')">← {{ t('profile.back') }}</button>
        <h2 id="profile-title">{{ t('profile.title') }}</h2>
      </div>

      <form class="profile-page__header" @submit.prevent="save">
        <div class="profile__current">
          <span class="profile__preview" v-html="avatarSvg(picked)" />
          <label class="online__field">
            <span>{{ t('online.name') }}</span>
            <input v-model="draftName" type="text" autocomplete="nickname" :maxlength="MAX_NAME_LENGTH" :placeholder="t('online.namePlaceholder')" />
          </label>
        </div>

        <AvatarPicker v-model="picked" />

        <div class="profile__buttons">
          <button type="submit" class="action action--primary" :disabled="!dirty && !saved">{{ saved ? t('profile.saved') : t('profile.save') }}</button>
        </div>

        <section v-if="account.enabled" class="account" aria-labelledby="account-title">
          <template v-if="account.user.value">
            <h3 id="account-title">{{ t('account.open') }}</h3>
            <p class="result__note">{{ t('account.signedInAs', { name: account.user.value.email ?? account.user.value.name ?? '' }) }}</p>
            <button type="button" class="action" @click="account.signOut()">{{ t('account.signOut') }}</button>
          </template>
          <template v-else>
            <h3 id="account-title">{{ t('account.guestTitle') }}</h3>
            <p class="result__note">{{ t('account.guestBody') }}</p>
            <div class="summary__choices">
              <button type="button" class="action action--primary" @click="account.signIn()">{{ t('account.signIn') }}</button>
              <button type="button" class="action" @click="account.signIn('register')">{{ t('account.createAccount') }}</button>
            </div>
          </template>
        </section>
      </form>

      <div class="profile-page__tabs" role="tablist" :aria-label="t('profile.tabs')" @keydown="onTabKey">
        <button
          v-for="name in TABS"
          :id="`profile-tab-${name}`"
          :key="name"
          ref="tabEls"
          type="button"
          role="tab"
          class="profile-page__tab"
          :aria-selected="tab === name"
          :aria-controls="`profile-panel-${name}`"
          :tabindex="tab === name ? 0 : -1"
          @click="select(name)"
        >
          {{ t(`profile.tab.${name}`) }}
        </button>
      </div>
      <div :id="`profile-panel-${tab}`" class="profile-page__panel" role="tabpanel" :aria-labelledby="`profile-tab-${tab}`" tabindex="0">
        <StatsTab v-if="tab === 'stats'" />
        <HistoryTab v-else-if="tab === 'history'" />
        <LeaderboardTab v-else />
      </div>
    </div>
  </section>
</template>
