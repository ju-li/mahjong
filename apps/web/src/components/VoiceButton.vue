<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VoiceClip } from '@mahjong/protocol'
import { audio } from '../game/sound'
import { useVoiceRecorder } from '../game/voiceChat'
import { useI18n } from '../i18n/useI18n'

/** Push-to-talk for online tables: hold to record, let go to send to everyone else. */
defineProps<{
  /** Display name of whoever's memo is playing, if anyone's is. */
  speakingName: string | null
}>()
const emit = defineEmits<{ send: [clip: VoiceClip] }>()

const { t } = useI18n()
const { state, elapsed, start, stop } = useVoiceRecorder((clip) => emit('send', clip))
const recording = computed(() => state.value === 'recording')
/** Show why nothing happened, after a press. */
const pressed = ref(false)
const hint = computed(() => {
  if (recording.value) return `${t('talk.recording')} · ${elapsed.value}s`
  if (!pressed.value) return null
  if (state.value === 'denied') return t('talk.denied')
  if (state.value === 'unsupported') return t('talk.unsupported')
  return null
})

function press(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  // A tap is a user gesture: wake the audio context so incoming memos can play (iOS).
  audio()
  pressed.value = true
  void start()
}

/** Space or Enter held on the focused button works like holding it down. */
function keydown(e: KeyboardEvent) {
  if (e.key !== ' ' && e.key !== 'Enter') return
  e.preventDefault()
  e.stopPropagation() // not a table shortcut
  if (e.repeat) return
  audio()
  pressed.value = true
  void start()
}
function keyup(e: KeyboardEvent) {
  if (e.key !== ' ' && e.key !== 'Enter') return
  e.preventDefault()
  stop()
}
</script>

<template>
  <div class="talk">
    <p v-if="speakingName" class="talk__toast" role="status">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 9h3l4-3v12l-4-3H4z" fill="currentColor" />
        <path d="M15 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
      </svg>
      {{ t('talk.speaking', { name: speakingName }) }}
    </p>
    <p v-if="hint" class="talk__hint" role="status">{{ hint }}</p>
    <button
      type="button"
      class="talk__button"
      :class="{ 'talk__button--recording': recording }"
      :aria-label="t('talk.hold')"
      :aria-pressed="recording"
      :title="t('talk.hold')"
      @pointerdown="press"
      @pointerup="stop"
      @pointercancel="stop"
      @lostpointercapture="stop"
      @contextmenu.prevent
      @keydown="keydown"
      @keyup="keyup"
      @blur="stop"
    >
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="3" width="6" height="11" rx="3" :fill="recording ? 'currentColor' : 'none'" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" />
      </svg>
    </button>
  </div>
</template>
