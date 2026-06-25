import { CH } from '@shared/types/ipc'

export interface FullscreenWindow {
  isFullScreen(): boolean
  setFullScreen(fullscreen: boolean): void
}

export interface WindowControlWindow extends FullscreenWindow {
  close(): void
  minimize(): void
  isMaximized(): boolean
  maximize(): void
  unmaximize(): void
}

export interface WindowIpcMain {
  on(channel: string, listener: (event: { sender: unknown }) => void): void
}

export type WindowFromSender = (sender: unknown) => WindowControlWindow | null | undefined

let windowControlsRegistered = false

export function toggleWindowFullscreen(win: FullscreenWindow | null | undefined): void {
  if (!win) return
  win.setFullScreen(!win.isFullScreen())
}

export function registerWindowControlIpc(ipcMain: WindowIpcMain, windowFromSender: WindowFromSender): void {
  if (windowControlsRegistered) return
  windowControlsRegistered = true

  ipcMain.on(CH.WINDOW_CLOSE, (event) => {
    windowFromSender(event.sender)?.close()
  })
  ipcMain.on(CH.WINDOW_MINIMIZE, (event) => {
    windowFromSender(event.sender)?.minimize()
  })
  ipcMain.on(CH.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const win = windowFromSender(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(CH.WINDOW_TOGGLE_FULLSCREEN, (event) => {
    toggleWindowFullscreen(windowFromSender(event.sender))
  })
}
