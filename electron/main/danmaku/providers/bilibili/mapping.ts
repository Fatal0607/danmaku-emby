import type { DanmakuEpisode, DanmakuSeason } from '@shared/types/danmaku'
import type { BiliEpisode, BiliSearchMedia } from './types'

// Pure mappers: bilibili raw shapes → internal danmaku types.

/** Search titles embed <em class="keyword"> highlight tags — strip them. */
export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

export function searchMediaToSeason(m: BiliSearchMedia): DanmakuSeason {
  const id = m.season_id ?? m.media_id
  return {
    provider: 'bilibili',
    providerIds: { seasonId: m.season_id, mediaId: m.media_id },
    indexedId: String(id ?? ''),
    title: stripHtml(m.title),
    type: m.season_type_name,
    imageUrl: m.cover,
    episodeCount: m.ep_size,
    year: m.pubtime ? new Date(m.pubtime * 1000).getFullYear() : undefined,
  }
}

export function biliEpisodeToEpisode(e: BiliEpisode): DanmakuEpisode {
  return {
    provider: 'bilibili',
    // cid is the danmaku key (oid for list.so).
    providerIds: { cid: e.cid, aid: e.aid, bvid: e.bvid, epid: e.id },
    indexedId: String(e.cid),
    title: e.long_title || e.title,
    episodeNumber: parseEpisodeNumber(e.title),
  }
}

function parseEpisodeNumber(title: string): number | undefined {
  const m = title.match(/(\d+)/)
  return m ? Number(m[1]) : undefined
}
