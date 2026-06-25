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
  private config: DandanplayConfig

  constructor(
    private readonly fetcher: FetchLike,
    config: DandanplayConfig = {},
  ) {
    this.config = config
  }

  /** Apply new config from the settings page without rebuilding the instance. */
  configure(config: DandanplayConfig): void {
    this.config = config
  }

  private get baseUrl(): string {
    return (this.config.baseUrl ?? OFFICIAL_BASE).replace(/\/+$/, '')
  }

  private get chConvert(): number {
    return this.config.chConvert ?? 0
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
    this.assertOk(res.status, res.data?.errorCode, res.data?.errorMessage, ddpHeader(res.headers, 'x-error-message'))
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
    this.assertOk(res.status, res.data?.errorCode, res.data?.errorMessage, ddpHeader(res.headers, 'x-error-message'))
    return (res.data.animes ?? []).map(animeToSeason)
  }

  async episodes(seasonId: string): Promise<DanmakuEpisode[]> {
    const path = `/api/v2/bangumi/${seasonId}`
    const res = await this.fetcher.request<DdpBangumiDetail>({
      url: this.baseUrl + path,
      headers: this.headers(path),
      responseType: 'json',
    })
    this.assertOk(res.status, res.data?.errorCode, res.data?.errorMessage, ddpHeader(res.headers, 'x-error-message'))
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
    this.assertOk(res.status, res.data?.errorCode, res.data?.errorMessage, ddpHeader(res.headers, 'x-error-message'))
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

  private assertOk(status: number, errorCode?: number, errorMessage?: string, authError?: string): void {
    if (status === 429) {
      throw new DanmakuError('DM_RATE_LIMITED', '请求过频,稍后重试(已自动节流)')
    }
    if (status === 403) {
      throw new DanmakuError('DM_NOT_LOGGED_IN', `弹弹play 鉴权失败: ${explainAuthError(authError)}`)
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

function ddpHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value
  }
  return undefined
}

function explainAuthError(reason?: string): string {
  switch (reason) {
    case 'Missing Authentication Headers':
      return '缺少 AppId/AppSecret 或签名请求头(Missing Authentication Headers)'
    case 'Invalid Timestamp':
      return '时间戳无效,请校准系统时间(Invalid Timestamp)'
    case 'Invalid AppId':
      return 'AppId 无效或应用尚未审核通过(Invalid AppId)'
    case 'Invalid Signature':
      return '签名不匹配,请检查 AppSecret(Invalid Signature)'
    case 'Invalid AppSecret':
      return 'AppSecret 无效(Invalid AppSecret)'
    default:
      return reason || '服务端拒绝请求(403)'
  }
}

/** dandanplay matches on the bare filename; drop the container extension. */
function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '')
}

/**
 * Build a DandanplayConfig from persisted `provider_configs.config_values`.
 * `appId` + `appSecret` (both present) form the official-API signing creds;
 * an empty `baseUrl`/creds means "official endpoint, no signing".
 */
export function toDandanplayConfig(values: Record<string, unknown>): DandanplayConfig {
  const baseUrl = typeof values.baseUrl === 'string' && values.baseUrl.trim() ? values.baseUrl.trim() : undefined
  const appId = typeof values.appId === 'string' ? values.appId.trim() : ''
  const appSecret = typeof values.appSecret === 'string' ? values.appSecret.trim() : ''
  const chRaw = Number(values.chConvert)
  const chConvert = chRaw === 1 || chRaw === 2 ? (chRaw as 1 | 2) : 0
  return {
    baseUrl,
    chConvert,
    credentials: appId && appSecret ? { appId, appSecret } : undefined,
  }
}
