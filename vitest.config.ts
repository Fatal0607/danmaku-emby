import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Unit tests run in Node (pure Main-process modules). Renderer/E2E come later
// (docs 07 §7.4). better-sqlite3-backed tests are gated behind the native build.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
