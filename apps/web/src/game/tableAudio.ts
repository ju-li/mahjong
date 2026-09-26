import { watch, type Ref } from 'vue'
import type { PlayerView } from '@mahjong/engine'
import { calloutFor, speakCallout } from './callout'
import { useSettings } from './settings'
import { playSound, soundFor } from './sound'

/** Plays sounds and speaks callouts as the table changes, per the player's settings. */
export function useTableAudio(view: Readonly<Ref<PlayerView | null>>): void {
  const { sound, voice } = useSettings()
  watch(view, (next, prev) => {
    if (!next) return
    if (sound.value) {
      const kind = soundFor(prev ?? null, next, next.seat)
      if (kind) playSound(kind)
    }
    if (voice.value) {
      const call = calloutFor(prev ?? null, next)
      if (call) speakCallout(call)
    }
  })
}
