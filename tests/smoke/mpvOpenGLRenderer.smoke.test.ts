import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const runIf = process.env.MPV_RENDER_OPENGL_SMOKE === '1' ? describe : describe.skip
const require = createRequire(import.meta.url)

function hasNonZeroRgb(data: Uint8Array): boolean {
  return data.some((value, index) => index % 4 !== 3 && value !== 0)
}

runIf('persistent libmpv OpenGL renderer', () => {
  test('renders multiple frames from one reusable OpenGL context', () => {
    const mod = require('@danmaku-emby/mpv-render') as typeof import('@danmaku-emby/mpv-render')
    const renderer = new mod.OpenGLRenderer(160, 90)

    try {
      renderer.load('av://lavfi:testsrc=size=160x90:rate=5:duration=2')
      const first = renderer.renderFrame()
      const second = renderer.renderFrame()
      const texture = renderer.getTextureInfo()

      expect(first).toMatchObject({ backend: 'opengl', width: 160, height: 90, format: 'rgba' })
      expect(second).toMatchObject({ backend: 'opengl', width: 160, height: 90, format: 'rgba' })
      expect(new Uint8Array(first.data).byteLength).toBe(160 * 90 * 4)
      expect(new Uint8Array(second.data).byteLength).toBe(160 * 90 * 4)
      expect(hasNonZeroRgb(new Uint8Array(first.data)) || hasNonZeroRgb(new Uint8Array(second.data))).toBe(true)
      expect(texture).toMatchObject({
        backend: 'opengl',
        width: 160,
        height: 90,
        internalFormat: 'rgba8',
      })
      expect(texture.textureId).toBeGreaterThan(0)
      expect(texture.fbo).toBeGreaterThan(0)
    } finally {
      renderer.dispose()
    }
  })
})
