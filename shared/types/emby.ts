// Emby domain types shared between Main and Renderer (docs 02).

export interface ServerInput {
  address: string // user input: http(s)://host:port or bare host
  username: string
  password: string
}

export interface EmbyServer {
  id: string // Emby ServerId
  name: string
  baseUrl: string
  userId: string
  username: string
  lastUsed?: number
  createdAt: number
}

export type EmbyItemType = 'Movie' | 'Series' | 'Season' | 'Episode' | 'Video'

export interface EmbyImageTags {
  primary?: string
  backdrop?: string
  thumb?: string
}

export interface EmbyItem {
  id: string
  serverId: string
  name: string
  type: EmbyItemType
  productionYear?: number
  overview?: string
  genres?: string[]
  communityRating?: number
  runTimeTicks?: number
  /** 0..1 resume position derived from UserData.PlaybackPositionTicks. */
  playedPercentage?: number
  playbackPositionTicks?: number
  indexNumber?: number // episode/season number
  parentIndexNumber?: number // season number for episodes
  seriesId?: string
  seriesName?: string
  imageTags?: EmbyImageTags
}

export interface EmbyView {
  id: string
  name: string
  collectionType?: string // 'movies' | 'tvshows' | ...
}

export interface Page<T> {
  items: T[]
  total: number
  startIndex: number
}

export interface ItemsQuery {
  serverId: string
  parentId?: string
  includeItemTypes?: EmbyItemType[]
  recursive?: boolean
  sortBy?: string
  sortOrder?: 'Ascending' | 'Descending'
  startIndex?: number
  limit?: number
  searchTerm?: string
  filters?: string[]
}

export type ImageType = 'Primary' | 'Backdrop' | 'Thumb'

export interface AudioStream {
  index: number
  codec: string
  language?: string
  displayTitle?: string
  channels?: number
  isDefault?: boolean
}

export interface SubtitleStream {
  index: number
  codec: string
  language?: string
  displayTitle?: string
  isExternal?: boolean
  deliveryUrl?: string
}

export type PlaybackMode = 'directPlay' | 'directStream' | 'transcode'

export interface PlaybackSource {
  itemId: string
  mediaSourceId: string
  url: string
  mode: PlaybackMode
  startTicks: number
  audioStreams: AudioStream[]
  subtitleStreams: SubtitleStream[]
  container: string
  /** filename of the media source — feeds danmaku auto-match. */
  fileName?: string
  fileSize?: number
  runTimeTicks?: number
}

export interface ProgressReport {
  serverId: string
  itemId: string
  mediaSourceId: string
  positionTicks: number
  isPaused: boolean
  event: 'start' | 'progress' | 'stop'
  playMethod?: PlaybackMode
}

export const TICKS_PER_SECOND = 10_000_000
