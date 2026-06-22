// Raw Emby HTTP response shapes (subset we consume). Mapped to shared/types.

export interface RawSystemInfoPublic {
  ServerName: string
  Version: string
  Id: string
  ProductName?: string
}

export interface RawAuthResult {
  AccessToken: string
  ServerId: string
  User: { Id: string; Name: string }
}

export interface RawUserData {
  PlaybackPositionTicks?: number
  PlayedPercentage?: number
  Played?: boolean
}

export interface RawImageTags {
  Primary?: string
  Thumb?: string
}

export interface RawItem {
  Id: string
  Name: string
  Type: string
  ProductionYear?: number
  Overview?: string
  Genres?: string[]
  CommunityRating?: number
  RunTimeTicks?: number
  IndexNumber?: number
  ParentIndexNumber?: number
  SeriesId?: string
  SeriesName?: string
  UserData?: RawUserData
  ImageTags?: RawImageTags
  BackdropImageTags?: string[]
}

export interface RawItemsResponse {
  Items: RawItem[]
  TotalRecordCount: number
}

export interface RawView {
  Id: string
  Name: string
  CollectionType?: string
}

export interface RawMediaStream {
  Type: 'Video' | 'Audio' | 'Subtitle'
  Index: number
  Codec: string
  Language?: string
  DisplayTitle?: string
  Channels?: number
  IsDefault?: boolean
  IsExternal?: boolean
  DeliveryUrl?: string
}

export interface RawMediaSource {
  Id: string
  Container?: string
  Name?: string
  Path?: string
  Size?: number
  RunTimeTicks?: number
  SupportsDirectPlay?: boolean
  SupportsDirectStream?: boolean
  TranscodingUrl?: string
  DirectStreamUrl?: string
  MediaStreams?: RawMediaStream[]
}

export interface RawPlaybackInfo {
  MediaSources: RawMediaSource[]
  PlaySessionId?: string
}
