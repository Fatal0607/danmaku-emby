import { describe, expect, test } from 'vitest'
import { buildMainWindowOptions } from '@/../electron/main/windowOptions'

describe('main window options', () => {
  test('uses native macOS traffic lights with a hidden inset titlebar', () => {
    const opts = buildMainWindowOptions({
      platform: 'darwin',
      preloadPath: '/tmp/preload.cjs',
    })

    expect(opts.frame).toBeUndefined()
    expect(opts.titleBarStyle).toBe('hiddenInset')
    expect(opts.trafficLightPosition).toEqual({ x: 18, y: 18 })
    expect(opts.webPreferences?.preload).toBe('/tmp/preload.cjs')
  })

  test('keeps frameless chrome on non-macOS platforms', () => {
    const opts = buildMainWindowOptions({
      platform: 'win32',
      preloadPath: '/tmp/preload.cjs',
    })

    expect(opts.frame).toBe(false)
    expect(opts.titleBarStyle).toBeUndefined()
    expect(opts.trafficLightPosition).toBeUndefined()
  })
})
