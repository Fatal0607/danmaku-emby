// Domain types shared between Main and Renderer (per architecture §1.3).

export interface Server {
  id: string
  name: string
  address: string
  initial: string
  accentFrom: string
  accentTo: string
  status: 'connected' | 'offline' | 'connecting'
  itemCount?: number
  /** Base URL (Emby path) — present for real servers, used to build image URLs. */
  baseUrl?: string
}

export type MediaKind = 'movie' | 'series' | 'anime'

export type DanmakuStatus = 'matched' | 'matching' | 'unmatched'

export interface MediaItem {
  id: string
  title: string
  originalTitle?: string
  kind: MediaKind
  year: number
  rating?: number
  genres: string[]
  /** Poster gradient `from,to` used as a fallback / by the mock catalog. */
  poster: [string, string]
  /** Real artwork URL (Emby). When present, PosterCard renders the image. */
  posterUrl?: string
  overview: string
  /** 0–1 watch progress for "continue watching". */
  progress?: number
  /** Runtime in seconds, when known from Emby. */
  durationSec?: number
  /** Resume position from Emby, passed back to PLAYER_LOAD. */
  playbackPositionTicks?: number
  /** Series id for episode items; used to fetch sibling episodes on detail pages. */
  seriesId?: string
  seasonNumber?: number
  episodeNumber?: number
  episodeLabel?: string
  durationLabel?: string
  quality?: string
  danmaku: {
    status: DanmakuStatus
    count?: number
    provider?: string
  }
}

export interface Episode {
  id: string
  number: number
  title: string
  duration: string
  poster: [string, string]
  watched?: boolean
  progress?: number
  danmaku: DanmakuStatus
  danmakuCount?: number
}

export interface MediaSection {
  id: string
  title: string
  collectionType?: string
  items: MediaItem[]
}

export interface DanmakuComment {
  id: string
  timeSec: number
  text: string
  color: string
  /** Vertical lane 0..n for scroll mode. */
  lane: number
  mode: 'scroll' | 'top' | 'bottom'
}
