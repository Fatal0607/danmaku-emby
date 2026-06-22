import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '@shared/types/ipc'
import type { IpcResult } from '@shared/types/ipc'
import type {
  EmbyItem,
  EmbyServer,
  EmbyView,
  ImageType,
  ItemsQuery,
  Page,
  PlaybackSource,
  ProgressReport,
  ServerInput,
} from '@shared/types/emby'

// Whitelisted, typed bridge (docs 06 §6.1). The renderer never sees ipcRenderer
// directly; only these namespaced methods. Each returns the IpcResult envelope.

const embyApi = {
  addServer: (input: ServerInput): Promise<IpcResult<EmbyServer>> =>
    ipcRenderer.invoke(CH.EMBY_ADD_SERVER, input),
  listServers: (): Promise<IpcResult<EmbyServer[]>> => ipcRenderer.invoke(CH.EMBY_LIST_SERVERS),
  removeServer: (serverId: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(CH.EMBY_REMOVE_SERVER, serverId),
  views: (serverId: string): Promise<IpcResult<EmbyView[]>> =>
    ipcRenderer.invoke(CH.EMBY_VIEWS, serverId),
  items: (query: ItemsQuery): Promise<IpcResult<Page<EmbyItem>>> =>
    ipcRenderer.invoke(CH.EMBY_ITEMS, query),
  item: (serverId: string, itemId: string): Promise<IpcResult<EmbyItem>> =>
    ipcRenderer.invoke(CH.EMBY_ITEM, serverId, itemId),
  episodes: (serverId: string, seriesId: string): Promise<IpcResult<EmbyItem[]>> =>
    ipcRenderer.invoke(CH.EMBY_EPISODES, serverId, seriesId),
  search: (serverId: string, term: string): Promise<IpcResult<Page<EmbyItem>>> =>
    ipcRenderer.invoke(CH.EMBY_SEARCH, serverId, term),
  playbackInfo: (
    serverId: string,
    itemId: string,
    startTicks?: number,
  ): Promise<IpcResult<PlaybackSource>> =>
    ipcRenderer.invoke(CH.EMBY_PLAYBACK_INFO, serverId, itemId, startTicks),
  reportProgress: (report: ProgressReport): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(CH.EMBY_PROGRESS, report),
  imageUrl: (
    serverId: string,
    itemId: string,
    type: ImageType,
    tag?: string,
  ): Promise<IpcResult<string>> =>
    ipcRenderer.invoke(CH.EMBY_IMAGE_URL, serverId, itemId, type, tag),
}

const api = {
  platform: process.platform,
  emby: embyApi,
}

export type RendererApi = typeof api

contextBridge.exposeInMainWorld('api', api)
