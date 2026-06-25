import { describe, expect, test } from 'vitest'
import { resolvePlayerEngineMode } from '@/../electron/main/player/engineMode'

describe('resolvePlayerEngineMode', () => {
  test('uses the single-window libmpv renderer by default', () => {
    expect(resolvePlayerEngineMode()).toBe('libmpv-render')
  })

  test('supports single-window aliases', () => {
    expect(resolvePlayerEngineMode('libmpv-render')).toBe('libmpv-render')
    expect(resolvePlayerEngineMode('l3')).toBe('libmpv-render')
    expect(resolvePlayerEngineMode('single-window')).toBe('libmpv-render')
    expect(resolvePlayerEngineMode('embedded')).toBe('libmpv-render')
  })

  test('keeps GPU mpv window as an explicit opt-in', () => {
    expect(resolvePlayerEngineMode('mpv')).toBe('mpv-window')
    expect(resolvePlayerEngineMode('mpv-window')).toBe('mpv-window')
  })
})
