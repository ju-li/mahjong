import { describe, expect, it } from 'vitest'
import { parseAvatarSeed, tidyName } from './profile'

describe('profile', () => {
  it('reads back only valid avatar seeds', () => {
    expect(parseAvatarSeed('123456')).toBe(123456)
    expect(parseAvatarSeed(String(2 ** 32))).toBeNull()
    expect(parseAvatarSeed('-4')).toBeNull()
    expect(parseAvatarSeed('abc')).toBeNull()
    expect(parseAvatarSeed(null)).toBeNull()
  })

  it('tidies names like the server does', () => {
    expect(tidyName('  Grandma \n Li ')).toBe('Grandma Li')
    expect(tidyName('x'.repeat(40))).toHaveLength(16)
  })
})
