import { ipcMain } from 'electron'
import { CH, type IpcError, type IpcErrorCode, type IpcResult } from '@shared/types/ipc'
import type { CommentEntity, DanmakuMatchInput } from '@shared/types/danmaku'
import type { AppServices } from '../AppServices'
import { DanmakuError } from '../danmaku/errors'
import type { AssOptions } from '../danmaku/render/toAss'

// Danmaku IPC: IpcResult envelope + DanmakuError code mapping (docs 04 §4.9).

function toIpcError(e: unknown): IpcError {
  if (e instanceof DanmakuError) return { code: e.code as IpcErrorCode, message: e.message }
  const message = e instanceof Error ? e.message : String(e)
  return { code: 'INTERNAL', message }
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

export function registerDanmakuIpc(services: AppServices): void {
  handle(CH.DM_AUTO_MATCH, (input) => services.danmakuAutoMatch(input as DanmakuMatchInput))
  handle(CH.DM_SEARCH, (keyword) => services.danmakuSearch(keyword as string))
  handle(CH.DM_EPISODES, (seasonId) => services.danmakuEpisodes(seasonId as string))
  handle(CH.DM_FETCH, (args) =>
    services.danmakuFetchManual(
      args as { serverId: string; embyItemId: string; seasonId: string; indexedId: string },
    ),
  )
  handle(CH.DM_TO_ASS, (comments, opts) =>
    services.danmakuToAss(comments as CommentEntity[], (opts ?? {}) as Partial<AssOptions>),
  )
}
