// Danmaku domain types shared between Main and Renderer (docs 04 §4.2).

/** Canonical comment: `p = "time,mode,color,userHash"`, `m` = text. */
export interface CommentEntity {
  p: string
  m: string
}

export type DanmakuProvider = 'dandanplay' | 'bilibili' | 'tencent'

export interface DanmakuTrack {
  provider: DanmakuProvider
  providerConfigId: string
  indexedId: string
  seasonId: string
  comments: CommentEntity[]
  commentCount: number
  lastChecked: number
}

export interface DanmakuSeason {
  provider: DanmakuProvider
  providerIds: Record<string, unknown>
  indexedId: string
  title: string
  type?: string
  imageUrl?: string
  episodeCount?: number
  year?: number
}

export interface DanmakuEpisode {
  provider: DanmakuProvider
  providerIds: Record<string, unknown>
  indexedId: string
  title: string
  episodeNumber?: number
}

export interface ProviderConfig {
  id: string
  manifestId: DanmakuProvider
  name: string
  enabled: boolean
  configValues: Record<string, unknown>
}

/** Persisted Emby-item → danmaku-track mapping (docs 05 danmaku_map). */
export interface DanmakuMapping {
  embyItemId: string
  serverId: string
  provider: DanmakuProvider
  seasonId: string
  indexedId: string
  source: 'auto' | 'manual'
  matchedAt: number
}

/** Auto-match input built from Emby metadata (docs 04 §4.6). */
export interface DanmakuMatchInput {
  embyItemId: string
  serverId: string
  fileName: string
  fileSize?: number
  videoDurationSec?: number
  seriesTitle?: string
  season?: number
  episode?: number
}

/** Comment parsed into structured fields for ASS rendering. */
export interface ParsedComment {
  timeSec: number
  mode: 1 | 4 | 5 // 1 scroll, 4 bottom, 5 top (dandanplay/bilibili convention)
  /** decimal RGB color, e.g. 16777215 = white. */
  color: number
  text: string
}

/** Render options that map into ASS styles (docs 05 §5.4 DanmakuRenderPrefs). */
export interface DanmakuRenderPrefs {
  enabled: boolean
  opacity: number // 0..1
  fontSize: number // px
  speed: number // scroll duration factor
  area: 'top' | 'half' | 'full'
  density: number // 0..1
  hideMode: Array<'scroll' | 'top' | 'bottom'>
  blockKeywords: string[]
}

export const DEFAULT_DANMAKU_PREFS: DanmakuRenderPrefs = {
  enabled: true,
  opacity: 0.85,
  fontSize: 24,
  speed: 1.0,
  area: 'full',
  density: 1.0,
  hideMode: [],
  blockKeywords: [],
}
