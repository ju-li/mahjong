<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MAX_FEEDBACK_MESSAGE, MAX_NAME_LENGTH } from '@mahjong/protocol'
import { track } from '../game/analytics'
import { deviceDiagnostics, sendFeedback, type FeedbackError } from '../game/feedback'
import { useProfile } from '../game/profile'
import { useI18n } from '../i18n/useI18n'

/**
 * Feedback form: name, email and message, mailed to the developers with two attachments —
 * device diagnostics (settings, console) and the game as it stood when the dialog opened.
 */
const props = defineProps<{
  /** Called once, on open: the app's settings, the game state and the online table code. */
  capture: () => { app: Record<string, unknown>; game: unknown; tableCode?: string }
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { name: profileName } = useProfile()

// The moment the player opened the form is the state they are reporting on.
const captured = props.capture()
const name = ref(profileName.value)
const email = ref('')
const message = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref<FeedbackError | null>(null)

async function submit() {
  if (sending.value || !message.value.trim()) return
  sending.value = true
  error.value = null
  error.value = await sendFeedback({
    name: name.value.trim(),
    email: email.value.trim(),
    message: message.value.trim(),
    diagnostics: await deviceDiagnostics(captured.app),
    game: captured.game,
    tableCode: captured.tableCode,
  })
  sending.value = false
  sent.value = error.value === null
  if (sent.value) track('feedback_sent')
}

const messageInput = ref<HTMLTextAreaElement | null>(null)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  messageInput.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result" role="dialog" aria-modal="true" aria-labelledby="feedback-title" @click.self="emit('close')">
    <div v-if="sent" class="result__card feedback">
      <h2 id="feedback-title">{{ t('feedback.title') }}</h2>
      <p role="status">{{ t('feedback.sent') }}</p>
      <div class="profile__buttons">
        <button type="button" class="action action--primary" autofocus @click="emit('close')">{{ t('feedback.close') }}</button>
      </div>
    </div>
    <form v-else class="result__card feedback" @submit.prevent="submit">
      <h2 id="feedback-title">{{ t('feedback.title') }}</h2>
      <p class="result__note">{{ t('feedback.intro') }}</p>

      <label class="online__field">
        <span>{{ t('feedback.name') }}</span>
        <input v-model="name" type="text" autocomplete="name" :maxlength="MAX_NAME_LENGTH * 4" />
      </label>
      <label class="online__field">
        <span>{{ t('feedback.email') }}</span>
        <input v-model="email" type="email" autocomplete="email" maxlength="254" />
      </label>
      <label class="online__field">
        <span>{{ t('feedback.message') }}</span>
        <textarea
          ref="messageInput"
          v-model="message"
          required
          rows="5"
          :maxlength="MAX_FEEDBACK_MESSAGE"
          :placeholder="t('feedback.messagePlaceholder')"
        />
      </label>

      <p v-if="error" class="online__error" role="alert">{{ t(`feedback.error.${error}`) }}</p>

      <div class="profile__buttons">
        <button type="button" class="action" @click="emit('close')">{{ t('online.cancel') }}</button>
        <button type="submit" class="action action--primary" :disabled="sending || !message.trim()">
          {{ sending ? t('feedback.sending') : t('feedback.send') }}
        </button>
      </div>
    </form>
  </div>
</template>
