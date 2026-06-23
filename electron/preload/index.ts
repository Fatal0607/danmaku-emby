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
import type {
  CommentEntity,
  DanmakuEpisode,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
  DanmakuTrack,
  ProviderConfig,
} from '@shared/types/danmaku'
import type { ProviderInfo } from '../main/danmaku/ProviderRegistry'
import type {
  PlayerCommand,
  PlayerLoadRequest,
  PlayerLoadResult,
  PlayerStatePush,
} from '@shared/types/player'

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

const danmakuApi = {
  listProviders: (): Promise<IpcResult<ProviderInfo[]>> => ipcRenderer.invoke(CH.DM_PROVIDERS),
  listConfigs: (): Promise<IpcResult<ProviderConfig[]>> => ipcRenderer.invoke(CH.DM_LIST_CONFIGS),
  setProviderEnabled: (id: string, enabled: boolean): Promise<IpcResult<ProviderConfig[]>> =>
    ipcRenderer.invoke(CH.DM_SET_ENABLED, id, enabled),
  reorderProviders: (orderedIds: string[]): Promise<IpcResult<ProviderConfig[]>> =>
    ipcRenderer.invoke(CH.DM_REORDER, orderedIds),
  autoMatch: (input: DanmakuMatchInput): Promise<IpcResult<DanmakuTrack | null>> =>
    ipcRenderer.invoke(CH.DM_AUTO_MATCH, input),
  search: (provider: ProviderId, keyword: string): Promise<IpcResult<DanmakuSeason[]>> =>
    ipcRenderer.invoke(CH.DM_SEARCH, provider, keyword),
  episodes: (provider: ProviderId, seasonId: string): Promise<IpcResult<DanmakuEpisode[]>> =>
    ipcRenderer.invoke(CH.DM_EPISODES, provider, seasonId),
  fetchManual: (args: {
    provider: ProviderId
    serverId: string
    embyItemId: string
    seasonId: string
    indexedId: string
  }): Promise<IpcResult<DanmakuTrack>> => ipcRenderer.invoke(CH.DM_FETCH, args),
  toAss: (
    comments: CommentEntity[],
    opts: { width?: number; height?: number; prefs?: unknown },
  ): Promise<IpcResult<string>> => ipcRenderer.invoke(CH.DM_TO_ASS, comments, opts),
}

const playerApi = {
  load: (req: PlayerLoadRequest): Promise<IpcResult<PlayerLoadResult>> =>
    ipcRenderer.invoke(CH.PLAYER_LOAD, req),
  command: (cmd: PlayerCommand): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(CH.PLAYER_CMD, cmd),
  /** Subscribe to pushed playback state; returns an unsubscribe function. */
  onState: (cb: (state: PlayerStatePush) => void): (() => void) => {
    const handler = (_e: unknown, state: PlayerStatePush) => cb(state)
    ipcRenderer.on(CH.PLAYER_STATE, handler)
    return () => ipcRenderer.removeListener(CH.PLAYER_STATE, handler)
  },
}

const api = {
  platform: process.platform,
  emby: embyApi,
  danmaku: danmakuApi,
  player: playerApi,
}

export type RendererApi = typeof api

contextBridge.exposeInMainWorld('api', api)
