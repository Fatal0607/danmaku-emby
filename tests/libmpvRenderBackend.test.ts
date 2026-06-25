import { describe, expect, test } from 'vitest'
import { resolveLibmpvRenderBackend } from '@/../electron/main/player/libmpvRenderBackend'

const report = {
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
      reason: 'OpenGL is not wired yet.',
    },
  ],
} as const

describe('resolveLibmpvRenderBackend', () => {
  test('uses the active native backend by default', () => {
    expect(resolveLibmpvRenderBackend(report, {})).toMatchObject({
      id: 'software',
      requested: 'software',
      zeroCopy: false,
      fallbackReason: undefined,
    })
  })

  test('falls back when a requested backend is not available', () => {
    expect(resolveLibmpvRenderBackend(report, { DMEMBY_L3_RENDER_BACKEND: 'opengl' })).toMatchObject({
      id: 'software',
      requested: 'opengl',
      zeroCopy: false,
      fallbackReason: 'Requested opengl backend is unavailable: OpenGL is not wired yet.',
    })
  })
})
