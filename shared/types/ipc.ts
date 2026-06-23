// IPC contract — channel constants and the unified result envelope.
// Mirrors docs/system-design/01-architecture.md §1.4 and §1.6.

export type IpcErrorCode =
  // Emby (02 §2.7)
  | 'EMBY_AUTH_FAILED'
  | 'EMBY_UNREACHABLE'
  | 'EMBY_INVALID_SERVER'
  | 'EMBY_NO_SOURCE'
  // Danmaku (04 §4.9)
  | 'DM_NOT_LOGGED_IN'
  | 'DM_REGION_BLOCKED'
  | 'DM_RATE_LIMITED'
  | 'DM_NO_MATCH'
  | 'DM_PARSE_FAILED'
  // Player
  | 'PLAYER_LOAD_FAILED'
  // Generic
  | 'BAD_REQUEST'
  | 'INTERNAL'

export interface IpcError {
  code: IpcErrorCode
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

/** Channel name registry. All Main↔Renderer invoke channels live here. */
export const CH = {
  // Window controls
  WINDOW_CLOSE: 'window:close',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggleMaximize',
  // Emby
  EMBY_ADD_SERVER: 'emby:addServer',
  EMBY_LIST_SERVERS: 'emby:listServers',
  EMBY_REMOVE_SERVER: 'emby:removeServer',
  EMBY_VIEWS: 'emby:views',
  EMBY_ITEMS: 'emby:items',
  EMBY_ITEM: 'emby:item',
  EMBY_SEASONS: 'emby:seasons',
  EMBY_EPISODES: 'emby:episodes',
  EMBY_SEARCH: 'emby:search',
  EMBY_PLAYBACK_INFO: 'emby:playbackInfo',
  EMBY_PROGRESS: 'emby:progress',
  EMBY_IMAGE_URL: 'emby:imageUrl',
  // Preferences
  PREFS_GET: 'prefs:get',
  PREFS_SET: 'prefs:set',
  // Player (push events use webContents.send)
  PLAYER_LOAD: 'player:load',
  PLAYER_CMD: 'player:cmd',
  PLAYER_STATE: 'player:state',
  PLAYER_FRAME: 'player:frame',
  // Danmaku
  DM_PROVIDERS: 'danmaku:listProviders',
  DM_LIST_CONFIGS: 'danmaku:listConfigs',
  DM_SET_ENABLED: 'danmaku:setProviderEnabled',
  DM_REORDER: 'danmaku:reorderProviders',
  DM_AUTO_MATCH: 'danmaku:autoMatch',
  DM_SEARCH: 'danmaku:search',
  DM_EPISODES: 'danmaku:episodes',
  DM_FETCH: 'danmaku:fetch',
  DM_TO_ASS: 'danmaku:toAss',
} as const

export type ChannelName = (typeof CH)[keyof typeof CH]
