<script setup lang="ts">
import { useToasts } from '../game/useToasts'
import { useI18n } from '../i18n/useI18n'

/** Toasts at the bottom of the screen, newest last; every one can be dismissed. */
const { t } = useI18n()
const { toasts, dismiss, act } = useToasts()
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="toast in toasts" :key="toast.id" class="toast" role="status">
      <p class="toast__text">{{ toast.text }}</p>
      <button
        v-for="(a, i) in toast.actions"
        :key="i"
        type="button"
        class="action toast__action"
        :class="{ 'action--primary': a.primary }"
        @click="act(toast, a)"
      >
        {{ a.label }}
      </button>
      <button type="button" class="toast__close" :aria-label="t('toast.dismiss')" :title="t('toast.dismiss')" @click="dismiss(toast.id)">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </div>
</template>
