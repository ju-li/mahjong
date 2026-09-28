<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TABLE_INVITE_GAP_MS, type Friend } from '@mahjong/protocol'
import { avatarSvg } from '../game/avatar'
import { canInviteToTable, groupFriends, tableStatus } from '../game/friends'
import { shareFriendInvite } from '../game/invite'
import { useAccount } from '../game/useAccount'
import { useSocial } from '../game/useSocial'
import { useI18n } from '../i18n/useI18n'

/**
 * Your friends: requests to answer, who's online (and at which table), everyone else, and a link
 * to invite more. At a table (`tableCode`), online friends can be invited to it; in solo play,
 * Play together hosts a new table and invites them.
 */
const props = defineProps<{ tableCode: string | null }>()
const emit = defineEmits<{ close: []; join: [code: string]; playWith: [userId: string] }>()

const { t } = useI18n()
const account = useAccount()
const social = useSocial()

const groups = computed(() => groupFriends(social.friends.value?.friends ?? []))
const total = computed(() => social.friends.value?.friends.length ?? 0)
const sections = computed(() =>
  (
    [
      { key: 'incoming', title: t('friends.incoming'), list: groups.value.incoming },
      { key: 'online', title: t('friends.online'), list: groups.value.online },
      { key: 'offline', title: t('friends.offline'), list: groups.value.offline },
      { key: 'outgoing', title: t('friends.outgoing'), list: groups.value.outgoing },
    ] as const
  ).filter((s) => s.list.length > 0),
)

const copied = ref(false)
async function invite() {
  const code = social.friends.value?.me.friendCode
  if (!code || (await shareFriendInvite(code, t)) !== 'copied') return
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

/** Friends just invited, so the button says so for a while instead of inviting again. */
const invited = ref(new Set<string>())
function inviteToTable(f: Friend) {
  if (!props.tableCode) return
  social.inviteToTable(f.userId, props.tableCode)
  invited.value = new Set(invited.value).add(f.userId)
  setTimeout(() => {
    const next = new Set(invited.value)
    next.delete(f.userId)
    invited.value = next
  }, TABLE_INVITE_GAP_MS)
}

function where(f: Friend): string | null {
  const s = tableStatus(f, props.tableCode)
  if (s.kind === 'mine') return t('friends.atYourTable')
  if (s.kind === 'other') return `${t('friends.atTable', { code: s.code })} · ${s.canJoin ? t('friends.seatsOpen', { n: s.openSeats }) : t('friends.tableFull')}`
  return null
}

/** Code of the friend's table if you could join it from here, else null. */
function joinable(f: Friend): string | null {
  const s = tableStatus(f, props.tableCode)
  return s.kind === 'other' && s.canJoin ? s.code : null
}

function removeFriend(f: Friend) {
  if (f.state !== 'friend' || window.confirm(t('friends.confirmRemove', { name: f.name }))) social.remove(f.userId)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result" role="dialog" aria-modal="true" aria-labelledby="friends-title" @click.self="emit('close')">
    <div class="result__card friends">
      <div class="friends__head">
        <h2 id="friends-title">{{ t('friends.title') }}</h2>
        <button v-if="account.signedIn.value" class="action action--primary" :disabled="!social.connected.value" @click="invite">
          {{ copied ? t('friends.copied') : t('friends.invite') }}
        </button>
      </div>

      <template v-if="!account.signedIn.value">
        <p>{{ t('friends.guest') }}</p>
        <div class="summary__choices">
          <button class="action action--primary" @click="account.signIn()">{{ t('account.signIn') }}</button>
          <button class="action" @click="account.signIn('register')">{{ t('account.createAccount') }}</button>
        </div>
      </template>
      <p v-else-if="!social.connected.value" class="result__note">{{ t('friends.connecting') }}</p>
      <p v-else-if="total === 0" class="result__note">{{ t('friends.empty') }}</p>
      <p v-else-if="tableCode" class="result__note">{{ groups.online.length ? t('friends.inviteHint') : t('friends.noneOnline') }}</p>

      <div v-if="account.signedIn.value && social.connected.value && total > 0" class="friends__list">
        <section v-for="s in sections" :key="s.key" class="friends__section" :aria-label="s.title">
          <h3>{{ s.title }} <span class="friends__n">{{ s.list.length }}</span></h3>
          <ul>
            <li v-for="f in s.list" :key="f.userId" class="friends__row">
              <span class="friends__face" :class="{ 'is-online': f.online }">
                <span v-html="avatarSvg(f.avatar ?? 0)" />
              </span>
              <span class="friends__who">
                <span class="friends__name">{{ f.name }}</span>
                <span v-if="where(f)" class="friends__where">{{ where(f) }}</span>
              </span>
              <span v-if="f.state === 'friend'" class="visually-hidden">{{ f.online ? t('friends.isOnline') : t('friends.isOffline') }}</span>
              <template v-if="f.state === 'incoming'">
                <button class="action action--primary friends__btn" @click="social.respond(f.userId, true)">{{ t('friends.accept') }}</button>
                <button class="action friends__btn" @click="social.respond(f.userId, false)">{{ t('friends.decline') }}</button>
              </template>
              <button v-else-if="f.state === 'outgoing'" class="action friends__btn" @click="social.remove(f.userId)">{{ t('friends.cancel') }}</button>
              <template v-else-if="canInviteToTable(f, tableCode) || joinable(f) || (!tableCode && f.online)">
                <button
                  v-if="!tableCode && f.online && !joinable(f)"
                  class="action action--primary friends__btn"
                  :aria-label="`${t('friends.playTogether')}: ${f.name}`"
                  @click="emit('playWith', f.userId)"
                >
                  {{ t('friends.playTogether') }}
                </button>
                <button
                  v-if="canInviteToTable(f, tableCode)"
                  class="action action--primary friends__btn"
                  :disabled="invited.has(f.userId)"
                  :aria-label="`${t('friends.inviteToTable')} ${f.name}`"
                  @click="inviteToTable(f)"
                >
                  {{ invited.has(f.userId) ? t('friends.invited') : t('friends.inviteToTable') }}
                </button>
                <button
                  v-if="joinable(f)"
                  class="action friends__btn"
                  :class="{ 'action--primary': !tableCode }"
                  :aria-label="`${t('friends.join')} ${f.name}`"
                  @click="emit('join', joinable(f)!)"
                >
                  {{ t('friends.join') }}
                </button>
              </template>
              <button v-else class="action friends__btn friends__remove" :aria-label="`${t('friends.remove')} ${f.name}`" @click="removeFriend(f)">
                {{ t('friends.remove') }}
              </button>
            </li>
          </ul>
        </section>
      </div>

      <button class="action friends__close" @click="emit('close')">{{ t('friends.close') }}</button>
    </div>
  </div>
</template>
