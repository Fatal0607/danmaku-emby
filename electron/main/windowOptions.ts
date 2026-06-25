import type { BrowserWindowConstructorOptions } from 'electron'

export interface MainWindowOptionsInput {
  platform: NodeJS.Platform
  preloadPath: string
}

export function buildMainWindowOptions({
  platform,
  preloadPath,
}: MainWindowOptionsInput): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#00000000',
    transparent: true,
    ...(platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 18 },
        }
      : {
          frame: false,
        }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }
}
