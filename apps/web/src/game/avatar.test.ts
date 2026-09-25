import { describe, expect, it } from 'vitest'
import { PLAYABLE_KINDS, FLOWER_KINDS } from '@mahjong/engine'
import { tileSvg } from '../components/tileArt'
import { avatarSeeds, avatarSvg } from './avatar'

describe('avatars', () => {
  it('are stable for a match and differ between players and matches', () => {
    expect(avatarSeeds(42)).toEqual(avatarSeeds(42))
    expect(avatarSeeds(42)).not.toEqual(avatarSeeds(43))
    const faces = avatarSeeds(7).map(avatarSvg)
    expect(new Set(faces).size).toBe(4)
    for (const f of faces) expect(f).toMatch(/^<svg[\s\S]*<\/svg>$/)
  })
})

describe('tile art', () => {
  it('draws a distinct face for every tile kind', () => {
    const faces = [...PLAYABLE_KINDS, ...FLOWER_KINDS].map(tileSvg)
    expect(new Set(faces).size).toBe(faces.length)
    for (const f of faces) expect(f).not.toContain('NaN')
  })
})
