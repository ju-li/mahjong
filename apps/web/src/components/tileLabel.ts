import type { TileKind } from '@mahjong/engine'
import type { MessageKey } from '../i18n/messages'

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

/** A tile's name for reading out or showing in words ("5 bamboo", "east wind"). */
export function tileLabel(kind: TileKind, t: Translate): string {
  switch (kind.suit) {
    case 'winds':
      return t('tile.wind', { wind: t(`wind.${kind.wind}`) })
    case 'dragons':
      return t(`tile.dragon.${kind.dragon}`)
    case 'flowers':
      if (kind.flower >= 9) return t(`tile.animal.${kind.flower as 9 | 10 | 11 | 12}`)
      return kind.flower <= 4 ? t('tile.flower', { n: kind.flower }) : t('tile.season', { n: kind.flower - 4 })
    default:
      return t('tile.suited', { rank: kind.rank, suit: t(`tile.${kind.suit}`) })
  }
}
