import type { DanmakuEpisode, DanmakuSeason } from '@shared/types/danmaku'
import type { TxPageItem, TxSearchItem } from './types'

// Pure mappers: Tencent raw shapes → internal danmaku types.

/** Search titles embed <em> highlight tags — strip them. */
export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim()
}

/** Map a search result to a season. Returns null when it lacks the cid/title. */
export function searchItemToSeason(item: TxSearchItem): DanmakuSeason | null {
  const cid = item.doc?.id
  const info = item.videoInfo
  if (!cid || !info?.title) return null
  return {
    provider: 'tencent',
    providerIds: { cid },
    indexedId: cid,
    title: stripHtml(info.title),
    type: info.typeName,
    imageUrl: info.imgUrl,
    year: info.year,
  }
}

/** Map an episode-list entry to an episode, dropping trailers and unkeyed rows. */
export function pageItemToEpisode(item: TxPageItem): DanmakuEpisode | null {
  const params = item.item_params
  if (!params?.vid) return null
  if (params.is_trailer === '1') return null
  const title = params.union_title || params.title || ''
  return {
    provider: 'tencent',
    providerIds: { vid: params.vid },
    indexedId: params.vid,
    title: stripHtml(title),
    episodeNumber: parseEpisodeNumber(title),
  }
}

function parseEpisodeNumber(title: string): number | undefined {
  const m = title.match(/(\d+)/)
  return m ? Number(m[1]) : undefined
}
