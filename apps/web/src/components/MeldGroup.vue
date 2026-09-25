<script setup lang="ts">
import type { ViewMeld } from '@mahjong/engine'
import TileFace from './TileFace.vue'

defineProps<{ meld: ViewMeld }>()
</script>

<template>
  <span class="meld" :class="{ 'meld--concealed': !meld.exposed }">
    <template v-if="meld.tiles">
      <TileFace
        v-for="(t, i) in meld.tiles"
        :key="t.id"
        :kind="t.kind"
        :back="!meld.exposed && (i === 0 || i === 3)"
        size="sm"
        :highlight="t.id === meld.claimedTileId"
      />
    </template>
    <template v-else>
      <TileFace v-for="i in 4" :key="i" back size="sm" />
    </template>
  </span>
</template>
