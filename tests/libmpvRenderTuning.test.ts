import { describe, expect, test } from 'vitest'
import {
  normalizeSoftwareFrameSize,
  resolveLibmpvRenderTuning,
} from '@/../electron/main/player/libmpvRenderTuning'

describe('libmpv software render tuning', () => {
  test('targets 60fps with a 720p software-frame budget by default', () => {
    const tuning = resolveLibmpvRenderTuning({})

    expect(tuning).toMatchObject({
      targetFps: 60,
      frameIntervalMs: 17,
      maxPixels: 1280 * 720,
    })
  })

  test('accepts bounded fps and pixel budget overrides', () => {
    const tuning = resolveLibmpvRenderTuning({
      DMEMBY_L3_TARGET_FPS: '30',
      DMEMBY_L3_MAX_PIXELS: String(1920 * 1080),
    })

    expect(tuning).toMatchObject({
      targetFps: 30,
      frameIntervalMs: 33,
      maxPixels: 1920 * 1080,
    })
  })

  test('scales oversized frame requests to the software-frame budget', () => {
    const tuning = resolveLibmpvRenderTuning({})

    expect(normalizeSoftwareFrameSize(3840, 2160, tuning)).toEqual({
      width: 1280,
      height: 720,
    })
  })
})
