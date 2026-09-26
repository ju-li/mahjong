import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, isBlockedCode, newRoomCode, normalizeCode } from './codes'

describe('room codes', () => {
  it('are four letters without I or O', () => {
    let n = 0
    const code = newRoomCode(new Set(), (k) => n++ % k)
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/)
    expect(CODE_ALPHABET).not.toMatch(/[IO]/)
  })

  it('skip codes already in use and rude ones', () => {
    const letters = (s: string) => [...s].map((c) => CODE_ALPHABET.indexOf(c))
    const draws = [...letters('ABCD'), ...letters('SHIT'.replace('I', 'A')), ...letters('FUCK'), ...letters('WXYZ')]
    let i = 0
    const code = newRoomCode(new Set(['ABCD', 'SHAT']), () => draws[i++]!)
    expect(isBlockedCode('FUCK')).toBe(true)
    expect(code).toBe('WXYZ')
  })

  it('normalize what people type or paste', () => {
    expect(normalizeCode(' kj-xw ')).toBe('KJXW')
    expect(normalizeCode('https://example.com/?room=KJXW')).toBeNull()
    expect(normalizeCode('KJX')).toBeNull()
    expect(normalizeCode('KJXO')).toBeNull()
  })
})
