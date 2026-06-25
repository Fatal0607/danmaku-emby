import { ipcMain, shell } from 'electron'
import { CH, type IpcError, type IpcResult } from '@shared/types/ipc'
import type { UpdateService } from '../update/UpdateService'
import { UpdateError } from '../update/UpdateService'

function toIpcError(e: unknown): IpcError {
  const message = e instanceof Error ? e.message : String(e)
  return { code: e instanceof UpdateError ? 'UPDATE_CHECK_FAILED' : 'INTERNAL', message }
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

export function registerUpdateIpc(updateService: UpdateService): void {
  handle(CH.UPDATE_CURRENT, () => updateService.current())
  handle(CH.UPDATE_CHECK, () => updateService.checkForUpdates())
  handle(CH.UPDATE_OPEN_RELEASE, async (url) => {
    await shell.openExternal(updateService.releasePageUrl(url as string | undefined))
  })
}
