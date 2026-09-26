import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Whole matches are played through the table; the 5 s default is too tight.
    testTimeout: 60_000,
  },
})
