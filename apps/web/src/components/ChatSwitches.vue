<script setup lang="ts">
import type { TableSettings } from '@mahjong/protocol'
import { useI18n } from '../i18n/useI18n'

/** The host's switches for voice memos and emoji reactions at an online table; others see them greyed out. */
defineProps<{ settings: Pick<TableSettings, 'voiceChat' | 'reactions'>; disabled?: boolean }>()
const emit = defineEmits<{ configure: [settings: Partial<TableSettings>] }>()

const { t } = useI18n()
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <label class="select toggle">
    <span class="toggle__label">
      <svg class="toggle__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="3" width="6" height="11" rx="3" :fill="settings.voiceChat ? 'currentColor' : 'none'" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        <path v-if="!settings.voiceChat" d="M4 4l16 16" />
      </svg>
      {{ t('table.voiceMemos') }}
    </span>
    <input
      class="toggle__input"
      type="checkbox"
      role="switch"
      :checked="settings.voiceChat"
      :disabled="disabled"
      @change="emit('configure', { voiceChat: checked($event) })"
    />
  </label>
  <label class="select toggle">
    <span class="toggle__label">
      <svg class="toggle__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
        <path v-if="!settings.reactions" d="M4 4l16 16" />
      </svg>
      {{ t('table.reactions') }}
    </span>
    <input
      class="toggle__input"
      type="checkbox"
      role="switch"
      :checked="settings.reactions"
      :disabled="disabled"
      @change="emit('configure', { reactions: checked($event) })"
    />
  </label>
</template>
