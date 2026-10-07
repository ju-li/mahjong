<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { VoiceClip } from '@mahjong/protocol'
import { audio } from '../game/sound'
import { clockOf, useVoiceRecorder } from '../game/voiceChat'
import { useI18n } from '../i18n/useI18n'

/** Voice memo at online tables: tap to record, tap the stop square to send; it sends by itself at the limit. */
const emit = defineEmits<{ send: [clip: VoiceClip]; recording: [on: boolean] }>()

const { t } = useI18n()
const { state, elapsed, levels, toggle } = useVoiceRecorder((clip) => emit('send', clip))
const recording = computed(() => state.value === 'recording')
/** Show why nothing happened, after a tap. */
const tapped = ref(false)
const hint = computed(() => {
  if (!tapped.value || recording.value) return null
  if (state.value === 'denied') return t('talk.denied')
  if (state.value === 'unsupported') return t('talk.unsupported')
  return null
})

// Starting counts too: the menu must stay open while the browser asks for the microphone.
const busy = computed(() => state.value === 'recording' || state.value === 'starting')
watch(busy, (on) => emit('recording', on))
onBeforeUnmount(() => emit('recording', false))

function tap() {
  // A tap is a user gesture: wake the audio context so memos and the equalizer work (iOS).
  audio()
  tapped.value = true
  toggle()
}
</script>

<template>
  <div class="voice-memo">
    <button
      type="button"
      class="voice-memo__button"
      :class="{ 'voice-memo__button--recording': recording }"
      :aria-label="recording ? t('talk.stop') : t('talk.record')"
      :aria-pressed="recording"
      :title="recording ? t('talk.stop') : t('talk.record')"
      @click="tap"
    >
      <span v-if="recording" class="voice-memo__stop" aria-hidden="true">
        <span v-for="(l, i) in levels" :key="i" class="voice-memo__bar" :style="{ '--level': l }" />
      </span>
      <svg v-else viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" />
      </svg>
    </button>
    <span v-if="recording" class="voice-memo__timer" role="timer">{{ clockOf(elapsed) }}</span>
    <p v-if="hint" class="voice-memo__hint" role="status">{{ hint }}</p>
  </div>
</template>
