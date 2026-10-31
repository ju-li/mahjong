import { describe, expect, it } from 'vitest'
import { fitWithin, prepareScreenshot, toBase64 } from './screenshot'

/** What the browser's `btoa` gives for these bytes. */
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

describe('feedback screenshots', () => {
  it('scales pictures down to fit, keeping their shape, and never up', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(1170, 2532, 2048)).toEqual({ width: 946, height: 2048 })
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 })
  })

  it('base64-encodes files bigger than one string-building slice', async () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256)
    const expected = Array.from({ length: 10 }, (_, i) => base64(bytes.subarray(i * 9999, (i + 1) * 9999))).join('')
    expect(await toBase64(new Blob([bytes.subarray(0, 99_990)]))).toBe(expected)
  })

  it('sends a small PNG as it is', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    expect(await prepareScreenshot(new Blob([png], { type: 'image/png' }))).toEqual({ type: 'image/png', data: base64(png) })
  })
})
