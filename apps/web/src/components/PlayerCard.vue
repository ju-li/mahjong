<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { avatarSvg } from '../game/avatar'
import { useAccount } from '../game/useAccount'
import { useSocial } from '../game/useSocial'
import { useI18n } from '../i18n/useI18n'

/** Another player at an online table: who they are, and a way to add them as a friend. */
const props = defineProps<{ name: string; avatar: number | null; userId: string | null; bot: boolean; canRemove?: boolean }>()
const emit = defineEmits<{ close: []; remove: [] }>()

const { t } = useI18n()
const account = useAccount()
const social = useSocial()

const state = computed(() => social.friends.value?.friends.find((f) => f.userId === props.userId)?.state ?? null)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result" role="dialog" aria-modal="true" aria-labelledby="player-title" @click.self="emit('close')">
    <div class="result__card player-card">
      <div class="profile__current">
        <span v-if="avatar !== null" class="profile__preview" v-html="avatarSvg(avatar)" />
        <h2 id="player-title">{{ name }}</h2>
      </div>

      <p v-if="bot" class="result__note">{{ t('friends.bot') }}</p>
      <p v-else-if="!userId" class="result__note">{{ t('friends.guestPlayer') }}</p>
      <button v-else-if="!account.signedIn.value" class="action action--primary" @click="account.signIn()">{{ t('friends.signInToAdd') }}</button>
      <p v-else-if="state === 'friend'" class="player-card__state">✓ {{ t('friends.already') }}</p>
      <p v-else-if="state === 'outgoing'" class="player-card__state">{{ t('friends.sent') }}</p>
      <button v-else-if="state === 'incoming'" class="action action--primary" @click="social.respond(userId, true)">{{ t('friends.accept') }}</button>
      <button v-else class="action action--primary" :disabled="!social.connected.value" @click="social.request(userId)">{{ t('friends.add') }}</button>

      <button v-if="canRemove" class="action player-card__remove" @click="emit('remove')">{{ t('lobby.removeFromTable') }}</button>
      <button class="action" @click="emit('close')">{{ t('friends.close') }}</button>
    </div>
  </div>
</template>
