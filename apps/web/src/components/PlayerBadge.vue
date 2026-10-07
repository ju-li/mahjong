<script setup lang="ts">
defineProps<{
  name: string
  /** Seat wind glyph, e.g. 東. */
  wind: string
  windLabel: string
  score: number
  avatar: string
  dealer: boolean
  dealerLabel: string
  active: boolean
  /** Their voice memo is playing. */
  speaking?: boolean
  /** Your own badge: a button that opens your profile. */
  editLabel?: string
  /** Someone else's badge at an online table: a button that opens their player card. */
  openLabel?: string
}>()
defineEmits<{ edit: []; open: [] }>()
</script>

<template>
  <component
    :is="editLabel || openLabel ? 'button' : 'div'"
    class="badge"
    :class="{ 'badge--active': active, 'badge--speaking': speaking, 'badge--editable': editLabel || openLabel }"
    :type="editLabel || openLabel ? 'button' : undefined"
    :title="editLabel ?? openLabel"
    @click="editLabel ? $emit('edit') : openLabel && $emit('open')"
  >
    <div class="badge__photo">
      <span class="badge__face" v-html="avatar" />
      <span class="badge__wind" :title="windLabel">{{ wind }}</span>
      <span v-if="dealer" class="badge__dealer" :title="dealerLabel">庄</span>
      <span v-if="speaking" class="badge__talk" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M4 9h3l4-3v12l-4-3H4z" fill="currentColor" />
          <path d="M15 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
      </span>
    </div>
    <div class="badge__text">
      <span class="badge__name">{{ name }}</span>
      <strong class="badge__score" :class="{ pos: score > 0, neg: score < 0 }">{{ score }}</strong>
    </div>
    <span v-if="editLabel || openLabel" class="visually-hidden">{{ editLabel ?? openLabel }}</span>
  </component>
</template>
