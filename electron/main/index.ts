import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CH } from '@shared/types/ipc'
import type { PlayerStatePush } from '@shared/types/player'
import { AppServices } from './AppServices'
import { registerEmbyIpc } from './ipc/registerEmbyIpc'
import { registerDanmakuIpc } from './ipc/registerDanmakuIpc'
import { registerPlayerIpc } from './ipc/registerPlayerIpc'
import { MpvEngine } from './player/MpvEngine'
import { PlayerController } from './player/PlayerController'

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
    backgroundColor: '#06080c',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Player engine + controller live with the window so state pushes target it.
  playerController = new PlayerController(
    new MpvEngine(),
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
        if (!win.isDestroyed()) win.webContents.send(CH.PLAYER_STATE, state)
      },
    },
  )
  registerPlayerIpc(playerController)

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  // Composition root: open the DB, build services, register IPC handlers.
  const dbPath = join(app.getPath('userData'), 'danmaku-emby.db')
  services = new AppServices(dbPath)
  registerEmbyIpc(services)
  registerDanmakuIpc(services)

  createWindow(services)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && services) createWindow(services)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  void playerController?.dispose()
  services?.store.close()
})
