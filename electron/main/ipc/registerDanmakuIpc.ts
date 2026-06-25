import { ipcMain } from 'electron'
import { CH, type IpcError, type IpcErrorCode, type IpcResult } from '@shared/types/ipc'
import type {
  CommentEntity,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeriesMatchInput,
} from '@shared/types/danmaku'
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
  handle(CH.DM_PROVIDERS, () => services.danmakuListProviders())
  handle(CH.DM_LIST_CONFIGS, () => services.danmakuListProviderConfigs())
  handle(CH.DM_SET_ENABLED, (id, enabled) =>
    services.danmakuSetProviderEnabled(id as string, enabled as boolean),
  )
  handle(CH.DM_SET_CONFIG, (id, configValues) =>
    services.danmakuSetProviderConfig(id as string, configValues as Record<string, unknown>),
  )
  handle(CH.DM_TEST, (id) => services.danmakuTestProvider(id as string))
  handle(CH.DM_REORDER, (orderedIds) =>
    services.danmakuReorderProviders(orderedIds as string[]),
  )
  handle(CH.DM_AUTO_MATCH, (input) => services.danmakuAutoMatch(input as DanmakuMatchInput))
  handle(CH.DM_AUTO_MATCH_SERIES, (input) =>
    services.danmakuAutoMatchSeries(input as DanmakuSeriesMatchInput),
  )
  handle(CH.DM_SAVE_MANUAL_SERIES, (args) =>
    services.danmakuSaveManualSeries(
      args as {
        provider: ProviderId
        serverId: string
        embyItemId: string
        seasonId: string
        seasonTitle?: string
      },
    ),
  )
  handle(CH.DM_SEARCH, (provider, keyword) =>
    services.danmakuSearch(provider as ProviderId, keyword as string),
  )
  handle(CH.DM_EPISODES, (provider, seasonId) =>
    services.danmakuEpisodes(provider as ProviderId, seasonId as string),
  )
  handle(CH.DM_FETCH, (args) =>
    services.danmakuFetchManual(
      args as {
        provider: ProviderId
        serverId: string
        embyItemId: string
        seasonId: string
        indexedId: string
      },
    ),
  )
  handle(CH.DM_TO_ASS, (comments, opts) =>
    services.danmakuToAss(comments as CommentEntity[], (opts ?? {}) as Partial<AssOptions>),
  )
}
