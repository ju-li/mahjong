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
    :class="{ 'badge--active': active, 'badge--editable': editLabel || openLabel }"
    :type="editLabel || openLabel ? 'button' : undefined"
    :title="editLabel ?? openLabel"
    @click="editLabel ? $emit('edit') : openLabel && $emit('open')"
  >
    <div class="badge__photo">
      <span class="badge__face" v-html="avatar" />
      <span class="badge__wind" :title="windLabel">{{ wind }}</span>
      <span v-if="dealer" class="badge__dealer" :title="dealerLabel">庄</span>
    </div>
    <div class="badge__text">
      <span class="badge__name">{{ name }}</span>
      <strong class="badge__score" :class="{ pos: score > 0, neg: score < 0 }">{{ score }}</strong>
    </div>
    <span v-if="editLabel || openLabel" class="visually-hidden">{{ editLabel ?? openLabel }}</span>
  </component>
</template>
