import { describe, expect, test } from 'vitest'
import {
  formatMpvGeometry,
  offsetViewportBounds,
  normalizeVideoBounds,
} from '@/../electron/main/player/videoBounds'

describe('video bounds helpers', () => {
  test('offsets renderer viewport bounds into window screen coordinates', () => {
    expect(
      offsetViewportBounds(
        { x: 100, y: 80, width: 1440, height: 900 },
        { x: 240.4, y: 96.6, width: 960.2, height: 540.7 },
      ),
    ).toEqual({ x: 340.4, y: 176.6, width: 960.2, height: 540.7 })
  })

  test('normalizes small and fractional bounds for mpv', () => {
    expect(normalizeVideoBounds({ x: 10.4, y: 20.6, width: 120.1, height: 90.3 })).toEqual({
      x: 10,
      y: 21,
      width: 320,
      height: 180,
    })
  })

  test('formats absolute mpv geometry with signed offsets', () => {
    expect(formatMpvGeometry({ x: 340.4, y: 176.6, width: 960.2, height: 540.7 })).toBe(
      '960x541+340+177',
    )
    expect(formatMpvGeometry({ x: -12.4, y: 0, width: 1280, height: 720 })).toBe(
      '1280x720-12+0',
    )
  })
})
