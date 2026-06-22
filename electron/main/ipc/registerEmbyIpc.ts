import { ipcMain } from 'electron'
import { CH, type IpcError, type IpcErrorCode, type IpcResult } from '@shared/types/ipc'
import type {
  ImageType,
  ItemsQuery,
  ProgressReport,
  ServerInput,
} from '@shared/types/emby'
import type { AppServices } from '../AppServices'
import { EmbyError } from '../emby/EmbyService'

// Thin IPC layer: wraps every handler in the IpcResult envelope and maps
// thrown errors to enumerated codes (docs 01 §1.6, 02 §2.7).

function toIpcError(e: unknown): IpcError {
  if (e instanceof EmbyError) return { code: e.code, message: e.message }
  const message = e instanceof Error ? e.message : String(e)
  const prefix = message.split(':')[0]
  const known: IpcErrorCode[] = [
    'EMBY_AUTH_FAILED',
    'EMBY_UNREACHABLE',
    'EMBY_INVALID_SERVER',
    'EMBY_NO_SOURCE',
  ]
  if ((known as string[]).includes(prefix)) {
    return { code: prefix as IpcErrorCode, message }
  }
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

export function registerEmbyIpc(services: AppServices): void {
  handle(CH.EMBY_ADD_SERVER, (input) => services.addServer(input as ServerInput))
  handle(CH.EMBY_LIST_SERVERS, () => services.listServers())
  handle(CH.EMBY_REMOVE_SERVER, (serverId) => services.removeServer(serverId as string))
  handle(CH.EMBY_VIEWS, (serverId) => services.getViews(serverId as string))
  handle(CH.EMBY_ITEMS, (query) => services.getItems(query as ItemsQuery))
  handle(CH.EMBY_ITEM, (serverId, itemId) =>
    services.getItem(serverId as string, itemId as string),
  )
  handle(CH.EMBY_EPISODES, (serverId, seriesId) =>
    services.getEpisodes(serverId as string, seriesId as string),
  )
  handle(CH.EMBY_SEARCH, (serverId, term) =>
    services.search(serverId as string, term as string),
  )
  handle(CH.EMBY_PLAYBACK_INFO, (serverId, itemId, startTicks) =>
    services.resolvePlayback(serverId as string, itemId as string, startTicks as number),
  )
  handle(CH.EMBY_PROGRESS, (report) => services.reportProgress(report as ProgressReport))
  handle(CH.EMBY_IMAGE_URL, (serverId, itemId, type, tag) =>
    services.imageUrl(serverId as string, itemId as string, type as ImageType, tag as string),
  )
}
