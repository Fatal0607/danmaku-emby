import { describe, expect, test, vi } from 'vitest'
import {
  toggleWindowFullscreen,
  type FullscreenWindow,
} from '@/../electron/main/ipc/windowControls'

class FakeFullscreenWindow implements FullscreenWindow {
  constructor(private fullscreen: boolean) {}

  isFullScreen(): boolean {
    return this.fullscreen
  }

  setFullScreen = vi.fn((fullscreen: boolean) => {
    this.fullscreen = fullscreen
  })
}

describe('window controls', () => {
  test('toggleWindowFullscreen enters fullscreen from windowed mode', () => {
    const win = new FakeFullscreenWindow(false)

    toggleWindowFullscreen(win)

    expect(win.setFullScreen).toHaveBeenCalledWith(true)
  })

  test('toggleWindowFullscreen exits fullscreen when already fullscreen', () => {
    const win = new FakeFullscreenWindow(true)

    toggleWindowFullscreen(win)

    expect(win.setFullScreen).toHaveBeenCalledWith(false)
  })

  test('toggleWindowFullscreen ignores a missing window', () => {
    expect(() => toggleWindowFullscreen(null)).not.toThrow()
  })
})
