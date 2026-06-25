import { BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from 'electron'
import { CH, type IpcError, type IpcResult } from '@shared/types/ipc'
import type { PlayerCommand, PlayerLoadRequest, PlayerVideoBounds } from '@shared/types/player'
import type { PlayerController } from '../player/PlayerController'
import { normalizeVideoBounds, offsetViewportBounds } from '../player/videoBounds'

// Player IPC: load/command go through the IpcResult envelope; state is pushed
// separately via webContents.send(CH.PLAYER_STATE) from the controller.

function toIpcError(e: unknown): IpcError {
  const message = e instanceof Error ? e.message : String(e)
  return { code: 'PLAYER_LOAD_FAILED', message }
}

function handle<T>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T,
): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(event, ...args) }
    } catch (e) {
      return { ok: false, error: toIpcError(e) }
    }
  })
}

export function registerPlayerIpc(controller: PlayerController): void {
  handle(CH.PLAYER_LOAD, (_event, req) => controller.load(req as PlayerLoadRequest))
  handle(CH.PLAYER_CMD, (event, cmd) => controller.command(normalizePlayerCommand(event, cmd as PlayerCommand)))
  handle(CH.PLAYER_DIAGNOSTICS, () => controller.getDiagnostics())
}

function normalizePlayerCommand(event: IpcMainInvokeEvent, cmd: PlayerCommand): PlayerCommand {
  if (cmd.type !== 'setVideoBounds') return cmd
  return { type: 'setVideoBounds', ...toScreenVideoBounds(event, cmd) }
}

function toScreenVideoBounds(event: IpcMainInvokeEvent, bounds: PlayerVideoBounds): PlayerVideoBounds {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return normalizeVideoBounds(bounds)

  const viewportInScreenDip = offsetViewportBounds(win.getBounds(), bounds)
  const converter = (screen as typeof screen & {
    dipToScreenRect?: (window: BrowserWindow | null, rect: Electron.Rectangle) => Electron.Rectangle
  }).dipToScreenRect
  const screenRect =
    typeof converter === 'function' ? converter(win, viewportInScreenDip) : viewportInScreenDip
  return normalizeVideoBounds(screenRect)
}
