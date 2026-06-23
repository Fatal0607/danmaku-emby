import type {
  CommentEntity,
  DanmakuEpisode,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
} from '@shared/types/danmaku'
import type { FetchLike } from '../../../net/FetchLike'
import { DanmakuError } from '../../errors'
import { parseBiliXml } from '../../net/decoders/biliXml'
import type { DanmakuSourceProvider } from '../DanmakuProvider'
import { biliEpisodeToEpisode, searchMediaToSeason } from './mapping'
import { encodeWbi, extractWbiKey, type WbiKeys } from './wbi'
import type {
  BiliNavResponse,
  BiliSearchResponse,
  BiliSeasonResponse,
} from './types'

const BASE = 'https://api.bilibili.com'
const REFERER = 'https://www.bilibili.com/'

// bilibili danmaku provider (docs 04 §4.5). Search needs WBI signing; comments
// come from the public XML endpoint keyed by `cid`. bilibili exposes no
// filename match, so auto-match is a no-op (users match via search).

export class BilibiliProvider implements DanmakuSourceProvider {
  readonly id: ProviderId = 'bilibili'
  private keys?: WbiKeys

  constructor(private readonly fetcher: FetchLike) {}

  // bilibili can't match by filename — handled via manual search.
  async match(_input: DanmakuMatchInput): Promise<DanmakuEpisode | null> {
    return null
  }

  async search(keyword: string): Promise<DanmakuSeason[]> {
    const keys = await this.getKeys()
    const query = encodeWbi({ search_type: 'media_bangumi', keyword }, keys)
    const res = await this.fetcher.request<BiliSearchResponse>({
      url: `${BASE}/x/web-interface/wbi/search/type?${query}`,
      headers: this.headers(),
      rewriteHeaders: { Referer: REFERER },
      credentials: 'include',
      responseType: 'json',
    })
    this.assertOk(res.status, res.data?.code, res.data?.message)
    return (res.data.data?.result ?? []).map(searchMediaToSeason)
  }

  async episodes(seasonId: string): Promise<DanmakuEpisode[]> {
    const res = await this.fetcher.request<BiliSeasonResponse>({
      url: `${BASE}/pgc/view/web/season?season_id=${encodeURIComponent(seasonId)}`,
      headers: this.headers(),
      rewriteHeaders: { Referer: REFERER },
      credentials: 'include',
      responseType: 'json',
    })
    this.assertOk(res.status, res.data?.code, res.data?.message)
    return (res.data.result?.episodes ?? []).map(biliEpisodeToEpisode)
  }

  async getComments(indexedId: string): Promise<CommentEntity[]> {
    const res = await this.fetcher.request<string>({
      url: `${BASE}/x/v1/dm/list.so?oid=${encodeURIComponent(indexedId)}`,
      headers: this.headers(),
      rewriteHeaders: { Referer: REFERER },
      credentials: 'include',
      responseType: 'xml',
    })
    if (res.status === 412) {
      throw new DanmakuError('DM_RATE_LIMITED', '请求过频,稍后重试(已自动节流)')
    }
    if (res.status >= 400) {
      throw new DanmakuError('DM_PARSE_FAILED', `B站弹幕请求失败(${res.status})`)
    }
    return parseBiliXml(res.data)
  }

  /** Fetch and cache WBI keys from the nav endpoint. */
  private async getKeys(): Promise<WbiKeys> {
    if (this.keys) return this.keys
    const res = await this.fetcher.request<BiliNavResponse>({
      url: `${BASE}/x/web-interface/nav`,
      headers: this.headers(),
      rewriteHeaders: { Referer: REFERER },
      credentials: 'include',
      responseType: 'json',
    })
    const img = res.data?.data?.wbi_img
    if (!img?.img_url || !img?.sub_url) {
      throw new DanmakuError('DM_PARSE_FAILED', '无法获取 B站 WBI 签名密钥')
    }
    this.keys = { imgKey: extractWbiKey(img.img_url), subKey: extractWbiKey(img.sub_url) }
    return this.keys
  }

  private headers(): Record<string, string> {
    return { Accept: 'application/json, text/xml, */*' }
  }

  private assertOk(status: number, code?: number, message?: string): void {
    if (status === 412 || code === -412) {
      throw new DanmakuError('DM_RATE_LIMITED', '请求过频,稍后重试(已自动节流)')
    }
    if (code === -101) {
      throw new DanmakuError('DM_NOT_LOGGED_IN', '需要登录 B站以获取完整弹幕')
    }
    if (status >= 400) {
      throw new DanmakuError('DM_PARSE_FAILED', `B站请求失败(${status})`)
    }
    if (code != null && code !== 0) {
      throw new DanmakuError('DM_PARSE_FAILED', message ?? `B站接口错误 ${code}`)
    }
  }
}
