import { FEEDBACK_SCREENSHOT_TYPES, MAX_FEEDBACK_SCREENSHOT_BYTES, type FeedbackScreenshot, type FeedbackScreenshotType } from '@mahjong/protocol'

/** Longest side of a picture we have to redraw: still enough to read every tile on a big screen. */
export const SCREENSHOT_MAX_SIDE = 2048

const sendable = (type: string): type is FeedbackScreenshotType => (FEEDBACK_SCREENSHOT_TYPES as readonly string[]).includes(type)

/** `width` × `height` scaled down, keeping its shape, so the longer side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  // In slices: spreading a whole screenshot into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * A picture the player picked or pasted, ready to send: as it is when it's already a small enough
 * PNG, JPEG or WebP, otherwise redrawn as a JPEG that fits. Null if the browser can't read it.
 */
export async function prepareScreenshot(file: Blob): Promise<FeedbackScreenshot | null> {
  if (sendable(file.type) && file.size <= MAX_FEEDBACK_SCREENSHOT_BYTES) return { type: file.type, data: await toBase64(file) }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    for (let side = SCREENSHOT_MAX_SIDE; side >= 512; side = Math.round(side * 0.75)) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, side)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      // JPEG has no transparency; without a background it turns black.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0, width, height)
      const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (jpeg && jpeg.size <= MAX_FEEDBACK_SCREENSHOT_BYTES) return { type: 'image/jpeg', data: await toBase64(jpeg) }
    }
    return null
  } finally {
    bitmap.close()
  }
}
