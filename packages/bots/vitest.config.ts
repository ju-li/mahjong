import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Bot tests play full hands; the 5 s default is too tight.
    testTimeout: 60_000,
  },
})
