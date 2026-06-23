import type {
  CommentEntity,
  DanmakuEpisode,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
} from '@shared/types/danmaku'
import type { FetchLike } from '../../../net/FetchLike'
import { DanmakuError } from '../../errors'
import type { DanmakuSourceProvider } from '../DanmakuProvider'
import { signRequest, type DandanplayCredentials } from './sign'
import {
  animeToSeason,
  commentsToEntities,
  episodeToEpisode,
  matchToEpisode,
} from './mapping'
import type {
  DdpBangumiDetail,
  DdpCommentResponse,
  DdpMatchResponse,
  DdpSearchResponse,
} from './types'

const OFFICIAL_BASE = 'https://api.dandanplay.net'

export interface DandanplayConfig {
  baseUrl?: string
  /** Omit when routing through a signing proxy (docs 06 §6.2). */
  credentials?: DandanplayCredentials
  /** Simplified/traditional conversion: 0 none, 1 simplified, 2 traditional. */
  chConvert?: 0 | 1 | 2
}

export class DandanplayProvider implements DanmakuSourceProvider {
  readonly id: ProviderId = 'dandanplay'
  private readonly baseUrl: string
  private readonly chConvert: number

  constructor(
    private readonly fetcher: FetchLike,
    private readonly config: DandanplayConfig = {},
  ) {
    this.baseUrl = (config.baseUrl ?? OFFICIAL_BASE).replace(/\/+$/, '')
    this.chConvert = config.chConvert ?? 0
  }

  async match(input: DanmakuMatchInput): Promise<DanmakuEpisode | null> {
    const path = '/api/v2/match'
    const res = await this.fetcher.request<DdpMatchResponse>({
      url: this.baseUrl + path,
      method: 'POST',
      headers: this.headers(path),
      body: JSON.stringify({
        fileName: stripExtension(input.fileName),
        fileSize: input.fileSize ?? 0,
        videoDuration: input.videoDurationSec ?? 0,
        matchMode: 'fileNameOnly',
      }),
      responseType: 'json',
    })
    this.assertOk(res.status, res.data?.errorCode, res.data?.errorMessage)
    if (!res.data.isMatched || !res.data.matches?.length) return null
    return matchToEpisode(res.data.matches[0])
  }

  async search(keyword: string): Promise<DanmakuSeason[]> {
    const path = '/api/v2/search/episodes'
    const url = `${this.baseUrl}${path}?anime=${encodeURIComponent(keyword)}`
    const res = await this.fetcher.request<DdpSearchResponse>({
      url,
      headers: this.headers(path),
      responseType: 'json',
    })
    this.assertOk(res.status, res.data?.errorCode, res.data?.errorMessage)
    return (res.data.animes ?? []).map(animeToSeason)
  }

  async episodes(seasonId: string): Promise<DanmakuEpisode[]> {
    const path = `/api/v2/bangumi/${seasonId}`
    const res = await this.fetcher.request<DdpBangumiDetail>({
      url: this.baseUrl + path,
      headers: this.headers(path),
      responseType: 'json',
    })
    this.assertOk(res.status, res.data?.errorCode, res.data?.errorMessage)
    const animeId = res.data.bangumi.animeId
    return (res.data.bangumi.episodes ?? []).map((e) => episodeToEpisode(e, animeId))
  }

  async getComments(indexedId: string): Promise<CommentEntity[]> {
    const path = `/api/v2/comment/${indexedId}`
    const url = `${this.baseUrl}${path}?withRelated=true&chConvert=${this.chConvert}`
    const res = await this.fetcher.request<DdpCommentResponse>({
      url,
      headers: this.headers(path),
      responseType: 'json',
    })
    this.assertOk(res.status, res.data?.errorCode, res.data?.errorMessage)
    return commentsToEntities(res.data.comments ?? [])
  }

  private headers(apiPath: string): Record<string, string> {
    const base: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (this.config.credentials) {
      return { ...base, ...signRequest(this.config.credentials, apiPath) }
    }
    return base
  }

  private assertOk(status: number, errorCode?: number, errorMessage?: string): void {
    if (status === 429) {
      throw new DanmakuError('DM_RATE_LIMITED', '请求过频,稍后重试(已自动节流)')
    }
    if (status === 401 || errorCode === 401) {
      throw new DanmakuError('DM_NOT_LOGGED_IN', '弹弹play 需要有效的 AppId 签名')
    }
    if (errorCode && errorCode !== 0) {
      throw new DanmakuError('DM_PARSE_FAILED', errorMessage ?? `弹弹play 接口错误 ${errorCode}`)
    }
    if (status >= 400) {
      throw new DanmakuError('DM_PARSE_FAILED', `弹弹play 请求失败(${status})`)
    }
  }
}

/** dandanplay matches on the bare filename; drop the container extension. */
function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '')
}
