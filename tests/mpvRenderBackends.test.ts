import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)

describe('mpv render backend report', () => {
  test('describes software and future zero-copy backends', () => {
    const mod = require('@danmaku-emby/mpv-render') as typeof import('@danmaku-emby/mpv-render')

    expect(mod.getRenderBackendReport()).toEqual({
      activeBackend: 'software',
      backends: [
        {
          id: 'software',
          apiType: 'sw',
          available: true,
          zeroCopy: false,
          reason: 'Active RGBA software-frame renderer.',
        },
        {
          id: 'opengl',
          apiType: 'opengl',
          available: false,
          zeroCopy: true,
          reason: 'Offscreen OpenGL FBO probe and persistent renderer are available, but this addon does not create a shared Electron/Chromium GL context yet.',
        },
        {
          id: 'metal',
          apiType: 'metal',
          available: false,
          zeroCopy: true,
          reason: 'libmpv render.h exposes software and OpenGL APIs here; Metal needs a separate bridge after OpenGL is proven.',
        },
      ],
    })
  })
})
