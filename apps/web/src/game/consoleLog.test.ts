import { describe as suite, expect, it } from 'vitest'
import { describe, record, recentLogs } from './consoleLog'

suite('console log capture', () => {
  it('turns console arguments into readable text', () => {
    expect(describe('hi')).toBe('hi')
    expect(describe({ a: 1 })).toBe('{"a":1}')
    expect(describe(new Error('boom'))).toContain('boom')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(describe(cyclic)).toBe('[object Object]')
  })

  it('keeps only the most recent entries, each bounded', () => {
    for (let i = 0; i < 400; i++) record('log', [`line ${i}`])
    record('error', ['x'.repeat(5000)])
    const logs = recentLogs()
    expect(logs).toHaveLength(300)
    expect(logs.at(-1)!.level).toBe('error')
    expect(logs.at(-1)!.text.length).toBeLessThan(2100)
    expect(logs[0]!.text).toBe('line 101')
  })
})
