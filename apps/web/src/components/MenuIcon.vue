<script setup lang="ts">
/** Line icons for the top bar and its menu, drawn in the current text colour. */
export type MenuIconName =
  | 'menu'
  | 'newMatch'
  | 'leave'
  | 'online'
  | 'pause'
  | 'friends'
  | 'signIn'
  | 'account'
  | 'settings'
  | 'language'
  | 'loadLatest'
  | 'rules'
  | 'feedback'
  | 'install'

defineProps<{ name: MenuIconName }>()
</script>

<template>
  <svg class="menu-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path v-if="name === 'menu'" d="M4 6h16M4 12h16M4 18h16" />
    <path v-else-if="name === 'newMatch'" d="M12 5v14M5 12h14" />
    <path v-else-if="name === 'leave'" d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" />
    <template v-else-if="name === 'online'">
      <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" />
    </template>
    <path v-else-if="name === 'pause'" d="M9 5v14M15 5v14" />
    <template v-else-if="name === 'friends'">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3 5.5" />
    </template>
    <path v-else-if="name === 'signIn'" d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
    <template v-else-if="name === 'account'">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </template>
    <template v-else-if="name === 'language'">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
    </template>
    <path v-else-if="name === 'loadLatest'" d="M20 12a8 8 0 0 1-14 5.3M4 20v-4h4M4 12a8 8 0 0 1 14-5.3M20 4v4h-4" />
    <path v-else-if="name === 'rules'" d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" />
    <path v-else-if="name === 'feedback'" d="M4 5h16v11H9l-5 4z" />
    <path v-else-if="name === 'install'" d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
</template>
