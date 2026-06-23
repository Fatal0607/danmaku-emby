import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const runIf = process.env.MPV_RENDER_SMOKE === '1' ? describe : describe.skip
const require = createRequire(import.meta.url)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

runIf('libmpv render API smoke', () => {
  test('renders a software RGBA frame without opening an mpv window', async () => {
    const { Player } = require('@danmaku-emby/mpv-render') as typeof import('@danmaku-emby/mpv-render')
    const player = new Player()

    try {
      player.load('av://lavfi:testsrc=size=160x90:rate=5:duration=3')
      player.setPause(false)
      await delay(700)

      const frame = player.renderFrame(160, 90)
      const bytes = new Uint8Array(frame.data)
      const nonZero = bytes.some((value, index) => index % 4 !== 3 && value !== 0)
      const state = player.getState()

      expect(frame).toMatchObject({ width: 160, height: 90, format: 'rgba' })
      expect(bytes.byteLength).toBe(160 * 90 * 4)
      expect(nonZero).toBe(true)
      expect(state.timeSec).toBeGreaterThanOrEqual(0)
    } finally {
      player.dispose()
    }
  })
})
