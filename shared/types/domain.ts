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
  /** Poster gradient `from,to` used by the mock catalog in place of artwork. */
  poster: [string, string]
  overview: string
  /** 0–1 watch progress for "continue watching". */
  progress?: number
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

export interface DanmakuComment {
  id: string
  timeSec: number
  text: string
  color: string
  /** Vertical lane 0..n for scroll mode. */
  lane: number
  mode: 'scroll' | 'top' | 'bottom'
}
