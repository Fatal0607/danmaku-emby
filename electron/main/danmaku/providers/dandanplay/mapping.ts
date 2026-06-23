import type { CommentEntity, DanmakuEpisode, DanmakuSeason } from '@shared/types/danmaku'
import type { DdpAnime, DdpComment, DdpEpisode, DdpMatch } from './types'

// Pure mappers: dandanplay raw shapes → internal danmaku types. Kept separate
// from the provider so they unit-test without network.

export function matchToEpisode(m: DdpMatch): DanmakuEpisode {
  return {
    provider: 'dandanplay',
    providerIds: { episodeId: m.episodeId, animeId: m.animeId },
    indexedId: String(m.episodeId),
    title: `${m.animeTitle} - ${m.episodeTitle}`,
    episodeNumber: parseEpisodeNumber(m.episodeTitle),
  }
}

export function animeToSeason(a: DdpAnime): DanmakuSeason {
  return {
    provider: 'dandanplay',
    providerIds: { animeId: a.animeId },
    indexedId: String(a.animeId),
    title: a.animeTitle,
    type: a.typeDescription ?? a.type,
    imageUrl: a.imageUrl,
    episodeCount: a.episodeCount ?? a.episodes?.length,
    year: a.startDate ? Number(a.startDate.slice(0, 4)) || undefined : undefined,
  }
}

export function episodeToEpisode(e: DdpEpisode, animeId: number): DanmakuEpisode {
  return {
    provider: 'dandanplay',
    providerIds: { episodeId: e.episodeId, animeId },
    indexedId: String(e.episodeId),
    title: e.episodeTitle,
    episodeNumber: parseEpisodeNumber(e.episodeTitle),
  }
}

/** dandanplay comments are already canonical `{p,m}`; copy defensively. */
export function commentsToEntities(comments: DdpComment[]): CommentEntity[] {
  const out: CommentEntity[] = []
  for (const c of comments) {
    if (typeof c.p === 'string' && typeof c.m === 'string') out.push({ p: c.p, m: c.m })
  }
  return out
}

/** Extract a leading episode number from a title like "第3话" / "3. Title". */
export function parseEpisodeNumber(title: string): number | undefined {
  const m = title.match(/第?\s*(\d+)\s*[话話集]?/)
  if (m) return Number(m[1])
  const lead = title.match(/^\s*(\d+)/)
  return lead ? Number(lead[1]) : undefined
}
