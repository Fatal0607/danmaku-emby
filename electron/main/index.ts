import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { AppServices } from './AppServices'
import { registerEmbyIpc } from './ipc/registerEmbyIpc'

const __dirname = dirname(fileURLToPath(import.meta.url))

let services: AppServices | null = null

// Frameless macOS window with traffic-light overlay — matches the design's
// borderless, hidden-titlebar chrome.
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#06080c',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // Composition root: open the DB, build services, register IPC handlers.
  const dbPath = join(app.getPath('userData'), 'danmaku-emby.db')
  services = new AppServices(dbPath)
  registerEmbyIpc(services)

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  services?.store.close()
})
