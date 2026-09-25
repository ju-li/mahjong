import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Property tests play hundreds of full hands; the 5 s default is too tight under parallel load.
    testTimeout: 30_000,
  },
})
