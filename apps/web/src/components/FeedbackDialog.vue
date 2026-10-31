<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MAX_FEEDBACK_MESSAGE, MAX_FEEDBACK_SCREENSHOTS, MAX_NAME_LENGTH, type FeedbackScreenshot } from '@mahjong/protocol'
import { track } from '../game/analytics'
import { deviceDiagnostics, sendFeedback, type FeedbackError } from '../game/feedback'
import { useProfile } from '../game/profile'
import { prepareScreenshot } from '../game/screenshot'
import { useI18n } from '../i18n/useI18n'

/**
 * Feedback form: name, email, message and optional screenshots, mailed to the developers with two
 * more attachments — device diagnostics (settings, console) and the game as it stood when the dialog opened.
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
const error = ref<FeedbackError | 'image' | null>(null)

const screenshots = ref<FeedbackScreenshot[]>([])
/** Pictures still being read or shrunk; sending waits for them. */
const adding = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)

/** Adds pictures, as many as there's room for; ones the browser can't read are reported, not sent. */
async function addScreenshots(files: File[]) {
  const room = MAX_FEEDBACK_SCREENSHOTS - screenshots.value.length - adding.value
  const images = files.filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room))
  if (files.length && !images.length && room > 0) error.value = 'image'
  adding.value += images.length
  await Promise.all(
    images.map(async (file) => {
      const shot = await prepareScreenshot(file).catch(() => null)
      adding.value--
      if (shot) screenshots.value.push(shot)
      else error.value = 'image'
    }),
  )
}
function picked(e: Event) {
  const input = e.target as HTMLInputElement
  void addScreenshots([...(input.files ?? [])])
  // So picking the same file again (after removing it) still counts as a change.
  input.value = ''
}
/** A pasted image (say, a screenshot just taken) is attached; pasted text goes where it always does. */
function pasted(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  e.preventDefault()
  void addScreenshots(files)
}

async function submit() {
  if (sending.value || adding.value || !message.value.trim()) return
  sending.value = true
  error.value = null
  error.value = await sendFeedback({
    name: name.value.trim(),
    email: email.value.trim(),
    message: message.value.trim(),
    diagnostics: await deviceDiagnostics(captured.app),
    game: captured.game,
    tableCode: captured.tableCode,
    screenshots: screenshots.value,
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
    <form v-else class="result__card feedback" @submit.prevent="submit" @paste="pasted">
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

      <div class="feedback__shots">
        <span class="feedback__label">{{ t('feedback.screenshots') }}</span>
        <ul v-if="screenshots.length || adding" class="feedback__thumbs">
          <li v-for="(shot, i) in screenshots" :key="i" class="feedback__thumb">
            <img :src="`data:${shot.type};base64,${shot.data}`" :alt="t('feedback.screenshotAlt', { n: i + 1 })" />
            <button type="button" class="feedback__remove" :aria-label="t('feedback.removeScreenshot', { n: i + 1 })" @click="screenshots.splice(i, 1)">×</button>
          </li>
          <li v-for="n in adding" :key="`adding-${n}`" class="feedback__thumb feedback__thumb--loading" :aria-label="t('feedback.addingScreenshot')" />
        </ul>
        <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="picked" />
        <button v-if="screenshots.length + adding < MAX_FEEDBACK_SCREENSHOTS" type="button" class="action feedback__add" @click="fileInput?.click()">
          {{ t('feedback.addScreenshot') }}
        </button>
        <span class="feedback__hint">{{ t('feedback.screenshotHint', { n: MAX_FEEDBACK_SCREENSHOTS }) }}</span>
      </div>

      <p v-if="error" class="online__error" role="alert">{{ t(`feedback.error.${error}`) }}</p>

      <div class="profile__buttons">
        <button type="button" class="action" @click="emit('close')">{{ t('online.cancel') }}</button>
        <button type="submit" class="action action--primary" :disabled="sending || adding > 0 || !message.trim()">
          {{ sending ? t('feedback.sending') : t('feedback.send') }}
        </button>
      </div>
    </form>
  </div>
</template>
