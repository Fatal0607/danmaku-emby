import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const runIf = process.env.MPV_RENDER_OPENGL_SMOKE === '1' ? describe : describe.skip
const require = createRequire(import.meta.url)

runIf('libmpv OpenGL render API smoke', () => {
  test('renders a frame into an offscreen OpenGL FBO', () => {
    const mod = require('@danmaku-emby/mpv-render') as typeof import('@danmaku-emby/mpv-render')

    const frame = mod.renderOpenGLProbeFrame(160, 90)
    const bytes = new Uint8Array(frame.data)
    const nonZero = bytes.some((value, index) => index % 4 !== 3 && value !== 0)

    expect(frame).toMatchObject({
      backend: 'opengl',
      width: 160,
      height: 90,
      format: 'rgba',
    })
    expect(bytes.byteLength).toBe(160 * 90 * 4)
    expect(nonZero).toBe(true)
  })
})
