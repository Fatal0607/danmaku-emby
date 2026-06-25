import { describe, expect, test } from 'vitest'
import { LibmpvRenderEngine } from '@/../electron/main/player/LibmpvRenderEngine'
import { MpvEngine } from '@/../electron/main/player/MpvEngine'

describe('player diagnostics', () => {
  test('mpv-window reports external GPU window output and current geometry', () => {
    const engine = new MpvEngine()
    engine.setVideoBounds({ x: 12.4, y: 34.6, width: 1440.2, height: 900.3 })

    expect(engine.getDiagnostics()).toMatchObject({
      engine: 'mpv-window',
      videoOutput: 'external-window',
      backend: 'mpv',
      hardwareDecode: true,
      zeroCopy: true,
      geometry: '1440x900+12+35',
    })
  })

  test('libmpv-render reports embedded software-frame output by default', () => {
    const engine = new LibmpvRenderEngine({ width: 1920, height: 1080 })

    expect(engine.getDiagnostics()).toMatchObject({
      engine: 'libmpv-render',
      videoOutput: 'software-frame',
      backend: 'software',
      hardwareDecode: false,
      zeroCopy: false,
      frameSize: { width: 1280, height: 720 },
    })
  })
})
