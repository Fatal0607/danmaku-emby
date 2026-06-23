// Raw bilibili web-API response shapes (subset consumed).

export interface BiliNavResponse {
  code: number
  data?: {
    isLogin: boolean
    wbi_img?: { img_url: string; sub_url: string }
  }
}

export interface BiliSearchMedia {
  season_id?: number
  media_id?: number
  title: string
  season_type_name?: string
  cover?: string
  pubtime?: number
  ep_size?: number
}

export interface BiliSearchResponse {
  code: number
  message?: string
  data?: { result?: BiliSearchMedia[] }
}

export interface BiliEpisode {
  id: number // epid
  cid: number // danmaku key
  aid: number
  bvid: string
  title: string // episode number/label
  long_title?: string // episode name
}

export interface BiliSeasonResponse {
  code: number
  message?: string
  result?: {
    season_id: number
    title: string
    episodes: BiliEpisode[]
  }
}
