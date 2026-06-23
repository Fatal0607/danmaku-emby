import type {
  CommentEntity,
  DanmakuEpisode,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
} from '@shared/types/danmaku'
import type { FetchLike } from '../../../net/FetchLike'
import { DanmakuError } from '../../errors'
import { parseTencentSegment } from '../../net/decoders/tencentDanmaku'
import type { DanmakuSourceProvider } from '../DanmakuProvider'
import { pageItemToEpisode, searchItemToSeason } from './mapping'
import type {
  TxBarrageBase,
  TxPageResponse,
  TxSearchResponse,
  TxSegmentIndex,
  TxSegmentResponse,
} from './types'

const SEARCH_URL =
  'https://pbaccess.video.qq.com/trpc.videosearch.mobile_search.MultiTerminalSearch/MbSearch?vplatform=2'
const PAGE_URL =
  'https://pbaccess.video.qq.com/trpc.universal_backend_service.page_server_rpc.PageServer/GetPageData?video_appid=3000010&vplatform=2&vversion_name=8.2.96'
const DM_BASE = 'https://dm.video.qq.com/barrage/base'
const DM_SEGMENT = 'https://dm.video.qq.com/barrage/segment'
const ORIGIN = 'https://v.qq.com'
const REFERER = 'https://v.qq.com/'

// Tencent Video danmaku provider (docs 04 §4.5). Search/episodes are POST RPC
// calls; comments come from a segment index (one request per ~5-minute chunk).
// Like bilibili, Tencent exposes no filename match, so auto-match is a no-op and
// users match via search.

export class TencentProvider implements DanmakuSourceProvider {
  readonly id: ProviderId = 'tencent'

  constructor(private readonly fetcher: FetchLike) {}

  async match(_input: DanmakuMatchInput): Promise<DanmakuEpisode | null> {
    return null
  }

  async search(keyword: string): Promise<DanmakuSeason[]> {
    const data = await this.post<TxSearchResponse>(SEARCH_URL, {
      query: keyword,
      version: '',
      filterValue: 'firstTabid=150',
      retry: 0,
      pagenum: 0,
      pagesize: 20,
      queryFrom: 0,
      isneedQc: true,
      adRequestInfo: '',
      sdkRequestInfo: '',
      sceneId: 21,
      platform: '23',
    })
    const items = data.data?.normalList?.itemList ?? []
    return items
      .map(searchItemToSeason)
      .filter((s): s is DanmakuSeason => s !== null)
  }

  async episodes(seasonId: string): Promise<DanmakuEpisode[]> {
    const data = await this.post<TxPageResponse>(PAGE_URL, {
      page_params: {
        req_from: 'web_vsite',
        page_id: 'vsite_episode_list',
        page_type: 'detail_operation',
        id_type: '1',
        page_size: '100',
        cid: seasonId,
        page_num: '0',
        page_context: `cid=${seasonId}`,
      },
      has_cache: 1,
    })

    const items = (data.data?.module_list_datas ?? [])
      .flatMap((m) => m.module_datas ?? [])
      .flatMap((m) => m.item_data_lists?.item_datas ?? [])
    return items
      .map(pageItemToEpisode)
      .filter((e): e is DanmakuEpisode => e !== null)
  }

  async getComments(vid: string): Promise<CommentEntity[]> {
    const base = await this.get<TxBarrageBase>(`${DM_BASE}/${vid}`)
    const segments = Object.values(base.segment_index ?? {}).filter(
      (s): s is TxSegmentIndex => !!s?.segment_name,
    )
    if (!segments.length) return []

    const parts = await Promise.all(segments.map((s) => this.fetchSegment(vid, s.segment_name!)))
    return parts.flat()
  }

  /** One failed/empty segment must not blank the whole track. */
  private async fetchSegment(vid: string, name: string): Promise<CommentEntity[]> {
    try {
      const seg = await this.get<TxSegmentResponse>(`${DM_SEGMENT}/${vid}/${name}`)
      return parseTencentSegment(seg)
    } catch {
      return []
    }
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const res = await this.fetcher.request<T>({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      rewriteHeaders: { Origin: ORIGIN, Referer: REFERER },
      body: JSON.stringify(body),
      responseType: 'json',
    })
    this.assertOk(res.status)
    return res.data
  }

  private async get<T>(url: string): Promise<T> {
    const res = await this.fetcher.request<T>({
      url,
      headers: { Accept: 'application/json' },
      rewriteHeaders: { Origin: ORIGIN, Referer: REFERER },
      responseType: 'json',
    })
    this.assertOk(res.status)
    return res.data
  }

  private assertOk(status: number): void {
    if (status === 429) {
      throw new DanmakuError('DM_RATE_LIMITED', '请求过频,稍后重试(已自动节流)')
    }
    if (status >= 400) {
      throw new DanmakuError('DM_PARSE_FAILED', `腾讯视频请求失败(${status})`)
    }
  }
}
