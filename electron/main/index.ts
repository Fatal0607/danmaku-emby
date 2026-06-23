import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CH } from '@shared/types/ipc'
import type { PlayerStatePush } from '@shared/types/player'
import { AppServices } from './AppServices'
import { registerEmbyIpc } from './ipc/registerEmbyIpc'
import { registerDanmakuIpc } from './ipc/registerDanmakuIpc'
import { registerPlayerIpc } from './ipc/registerPlayerIpc'
import { LibmpvRenderEngine } from './player/LibmpvRenderEngine'
import { MpvEngine } from './player/MpvEngine'
import { PlayerController } from './player/PlayerController'
import { hasVideoFrames, type PlayerEngine } from './player/PlayerEngine'

const __dirname = dirname(fileURLToPath(import.meta.url))

let services: AppServices | null = null
let playerController: PlayerController | null = null

// Frameless macOS window with traffic-light overlay — matches the design's
// borderless, hidden-titlebar chrome.
function createWindow(svc: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#00000000',
    frame: false,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setBackgroundColor('#00000000')
  win.getContentView().setBackgroundColor('#00000000')

  // Player engine + controller live with the window so state pushes target it.
  const engine = createPlayerEngine(win)
  if (hasVideoFrames(engine)) {
    engine.onFrame((frame) => sendPlayerFrame(win, frame))
  }
  playerController = new PlayerController(
    engine,
    {
      resolvePlayback: (s, i, t) => svc.resolvePlayback(s, i, t),
      reportProgress: (r) => svc.reportProgress(r),
    },
    {
      autoMatch: (input) => svc.danmakuAutoMatch(input),
      toAss: (comments, opts) => svc.danmakuToAss(comments, opts ?? {}),
    },
    {
      send: (state: PlayerStatePush) => {
        sendPlayerState(win, state)
      },
    },
  )
  registerPlayerIpc(playerController)

  const syncPlayerOverlayMode = () => {
    const isPlayer = win.webContents.getURL().includes('#/player/')
    if (!isPlayer) win.setAlwaysOnTop(false)
  }
  win.webContents.on('did-finish-load', syncPlayerOverlayMode)
  win.webContents.on('did-navigate-in-page', syncPlayerOverlayMode)

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }
  return win
}

function createPlayerEngine(win: BrowserWindow): PlayerEngine {
  const engine = process.env.DMEMBY_PLAYER_ENGINE ?? 'libmpv-render'
  if (engine !== 'mpv' && engine !== 'mpv-window') return new LibmpvRenderEngine()

  return new MpvEngine({
    getVideoWindowBounds: () => getVideoWindowBounds(win),
    getEmbedWindowId: () => {
      if (process.env.DMEMBY_MPV_EMBED !== '1') return undefined
      return getMpvEmbedWindowId(win)
    },
  })
}

function getVideoWindowBounds(win: BrowserWindow) {
  const bounds = win.getBounds()
  const converter = (screen as typeof screen & {
    dipToScreenRect?: (window: BrowserWindow | null, rect: Electron.Rectangle) => Electron.Rectangle
  }).dipToScreenRect
  if (typeof converter === 'function') return converter(win, bounds)
  return bounds
}

function getMpvEmbedWindowId(win: BrowserWindow): string | undefined {
  if (process.platform === 'darwin') {
    const windowId = parseMediaSourceWindowId(win.getMediaSourceId())
    if (windowId) return windowId
  }

  const handle = win.getNativeWindowHandle()
  if (handle.length >= 8) {
    const id = handle.readBigUInt64LE(0)
    return id > 0n ? id.toString() : undefined
  }
  if (handle.length >= 4) {
    const id = handle.readUInt32LE(0)
    return id > 0 ? String(id) : undefined
  }
  return undefined
}

function parseMediaSourceWindowId(mediaSourceId: string): string | undefined {
  const match = /^window:(\d+):/.exec(mediaSourceId)
  if (!match || match[1] === '0') return undefined
  return match[1]
}

function sendPlayerState(win: BrowserWindow, state: PlayerStatePush): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  try {
    win.webContents.send(CH.PLAYER_STATE, state)
  } catch {
    // The renderer frame can disappear while mpv is still emitting teardown events.
  }
}

function sendPlayerFrame(
  win: BrowserWindow,
  frame: { width: number; height: number; format: 'rgba'; data: Uint8Array },
): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  try {
    win.webContents.send(CH.PLAYER_FRAME, frame)
  } catch {
    // The renderer frame can disappear while the native render loop is active.
  }
}

app.whenReady().then(() => {
  // Composition root: open the DB, build services, register IPC handlers.
  const dbPath = join(app.getPath('userData'), 'danmaku-emby.db')
  services = new AppServices(dbPath)
  registerEmbyIpc(services)
  registerDanmakuIpc(services)
  registerWindowControlIpc()

  createWindow(services)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && services) createWindow(services)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void playerController?.dispose()
  playerController = null
})

app.on('will-quit', () => {
  void playerController?.dispose()
  services?.store.close()
})

let windowControlsRegistered = false

function registerWindowControlIpc(): void {
  if (windowControlsRegistered) return
  windowControlsRegistered = true
  ipcMain.on(CH.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.on(CH.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on(CH.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
}
