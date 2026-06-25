import { app, BrowserWindow, ipcMain, screen } from 'electron'
import type { WebContents } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CH } from '@shared/types/ipc'
import type { PlayerStatePush } from '@shared/types/player'
import { AppServices } from './AppServices'
import { registerEmbyIpc } from './ipc/registerEmbyIpc'
import { registerDanmakuIpc } from './ipc/registerDanmakuIpc'
import { registerPlayerIpc } from './ipc/registerPlayerIpc'
import { registerUpdateIpc } from './ipc/registerUpdateIpc'
import { registerWindowControlIpc } from './ipc/windowControls'
import { LibmpvRenderEngine } from './player/LibmpvRenderEngine'
import { MpvEngine } from './player/MpvEngine'
import { PlayerController } from './player/PlayerController'
import { hasVideoFrames, type PlayerEngine } from './player/PlayerEngine'
import { resolvePlayerEngineMode } from './player/engineMode'
import { UpdateService } from './update/UpdateService'
import { buildMainWindowOptions } from './windowOptions'

const __dirname = dirname(fileURLToPath(import.meta.url))

let services: AppServices | null = null
let playerController: PlayerController | null = null

// macOS uses native traffic lights with a hidden inset titlebar; other
// platforms keep the app's frameless chrome.
function createWindow(svc: AppServices): BrowserWindow {
  const win = new BrowserWindow(
    buildMainWindowOptions({
      platform: process.platform,
      preloadPath: join(__dirname, '../preload/index.cjs'),
    }),
  )
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
  const engine = resolvePlayerEngineMode(process.env.DMEMBY_PLAYER_ENGINE)
  if (engine === 'libmpv-render') return new LibmpvRenderEngine()

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
  registerUpdateIpc(
    new UpdateService({
      owner: process.env.DMEMBY_UPDATE_OWNER ?? 'Fatal0607',
      repo: process.env.DMEMBY_UPDATE_REPO ?? 'danmaku-emby',
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
    }),
  )
  registerWindowControlIpc(ipcMain, (sender) => BrowserWindow.fromWebContents(sender as WebContents))

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
