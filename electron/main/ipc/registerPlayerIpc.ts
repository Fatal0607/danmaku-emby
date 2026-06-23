import { ipcMain } from 'electron'
import { CH, type IpcError, type IpcResult } from '@shared/types/ipc'
import type { PlayerCommand, PlayerLoadRequest } from '@shared/types/player'
import type { PlayerController } from '../player/PlayerController'

// Player IPC: load/command go through the IpcResult envelope; state is pushed
// separately via webContents.send(CH.PLAYER_STATE) from the controller.

function toIpcError(e: unknown): IpcError {
  const message = e instanceof Error ? e.message : String(e)
  return { code: 'PLAYER_LOAD_FAILED', message }
}

function handle<T>(channel: string, fn: (...args: unknown[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (e) {
      return { ok: false, error: toIpcError(e) }
    }
  })
}

export function registerPlayerIpc(controller: PlayerController): void {
  handle(CH.PLAYER_LOAD, (req) => controller.load(req as PlayerLoadRequest))
  handle(CH.PLAYER_CMD, (cmd) => controller.command(cmd as PlayerCommand))
}
