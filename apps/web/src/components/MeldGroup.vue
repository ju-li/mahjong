<script setup lang="ts">
import type { ViewMeld } from '@mahjong/engine'
import TileFace from './TileFace.vue'

withDefaults(defineProps<{ meld: ViewMeld; size?: 'xs' | 'sm' }>(), { size: 'sm' })
</script>

<template>
  <span class="meld" :class="{ 'meld--concealed': !meld.exposed }">
    <template v-if="meld.tiles">
      <TileFace
        v-for="(t, i) in meld.tiles"
        :key="t.id"
        :kind="t.kind"
        :tile-id="t.id"
        :back="!meld.exposed && (i === 0 || i === 3)"
        :size="size"
        :highlight="t.id === meld.claimedTileId"
      />
    </template>
    <template v-else>
      <TileFace v-for="i in 4" :key="i" back :size="size" />
    </template>
  </span>
</template>
