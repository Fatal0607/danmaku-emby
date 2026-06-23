// Raw dandanplay API response shapes (subset consumed). API v2.

export interface DdpMatch {
  episodeId: number
  animeId: number
  animeTitle: string
  episodeTitle: string
  type?: string
  typeDescription?: string
  shift?: number
}

export interface DdpMatchResponse {
  isMatched: boolean
  matches: DdpMatch[]
  errorCode?: number
  errorMessage?: string
}

export interface DdpEpisode {
  episodeId: number
  episodeTitle: string
}

export interface DdpAnime {
  animeId: number
  animeTitle: string
  type?: string
  typeDescription?: string
  imageUrl?: string
  startDate?: string
  episodeCount?: number
  episodes?: DdpEpisode[]
}

export interface DdpSearchResponse {
  animes: DdpAnime[]
  errorCode?: number
  errorMessage?: string
}

export interface DdpBangumiDetail {
  bangumi: {
    animeId: number
    animeTitle: string
    type?: string
    episodes: DdpEpisode[]
  }
  errorCode?: number
  errorMessage?: string
}

/** Comment `p` is already canonical: "time,mode,color,uid". */
export interface DdpComment {
  cid: number
  p: string
  m: string
}

export interface DdpCommentResponse {
  count: number
  comments: DdpComment[]
  errorCode?: number
  errorMessage?: string
}
