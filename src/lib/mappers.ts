import type { EmbyItem, EmbyServer } from '@shared/types/emby'
import { TICKS_PER_SECOND } from '@shared/types/emby'
import type { MediaItem, MediaKind, Server, Episode } from '@shared/types/domain'

// Map Emby domain types to the renderer's view models. Real artwork comes from
// the Emby image endpoint; a deterministic gradient is used as a fallback so the
// UI never shows an empty poster.

const GRADIENTS: Array<[string, string]> = [
  ['#1d3a6e', '#0e1b3a'],
  ['#5a2746', '#26101f'],
  ['#2a5f57', '#102420'],
  ['#4a3a6e', '#1c1530'],
  ['#6e5326', '#2e2110'],
  ['#1f5a6e', '#0e2630'],
]

const SERVER_ACCENTS: Array<[string, string]> = [
  ['#3a82f7', '#6a5bff'],
  ['#2a8f6a', '#1f6f9c'],
  ['#7a5bff', '#3a82f7'],
  ['#c2603a', '#7a2f5b'],
]

function hashIndex(seed: string, mod: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % mod
}

function gradientFor(id: string): [string, string] {
  return GRADIENTS[hashIndex(id, GRADIENTS.length)]
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function ticksToLabel(ticks?: number): string | undefined {
  if (!ticks) return undefined
  const total = Math.round(ticks / TICKS_PER_SECOND)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function kindOf(item: EmbyItem): MediaKind {
  if (item.type === 'Movie') return 'movie'
  // Emby has no first-class "anime"; infer from genres, else treat as series.
  const genres = (item.genres ?? []).join(',')
  if (/动画|动漫|anime|animation/i.test(genres)) return 'anime'
  return 'series'
}

/** Build the Emby Primary image URL (no token needed; tag hits server cache). */
export function embyImageUrl(
  baseUrl: string,
  itemId: string,
  tag?: string,
  height = 600,
): string {
  const params = new URLSearchParams({ fillHeight: String(height), quality: '90' })
  if (tag) params.set('tag', tag)
  return `${baseUrl.replace(/\/+$/, '')}/Items/${itemId}/Images/Primary?${params.toString()}`
}

export function embyItemToMedia(item: EmbyItem, baseUrl?: string): MediaItem {
  const primaryTag = item.imageTags?.primary
  const posterUrl =
    baseUrl && primaryTag ? embyImageUrl(baseUrl, item.id, primaryTag) : undefined
  const episodeLabel =
    item.type === 'Episode' && item.indexNumber != null
      ? `第 ${item.indexNumber} 集`
      : item.type !== 'Movie' && item.playedPercentage
        ? '继续观看'
        : undefined

  return {
    id: item.id,
    title: item.name,
    kind: kindOf(item),
    year: item.productionYear ?? 0,
    rating: item.communityRating,
    genres: item.genres ?? [],
    poster: gradientFor(item.id),
    posterUrl,
    overview: item.overview ?? '',
    progress: item.playedPercentage,
    episodeLabel,
    durationLabel: ticksToLabel(item.runTimeTicks),
    // Danmaku match status is resolved separately (danmaku_map); default unknown.
    danmaku: { status: 'unmatched' },
  }
}

export function embyEpisodeToView(item: EmbyItem, index: number): Episode {
  return {
    id: item.id,
    number: item.indexNumber ?? index + 1,
    title: item.name,
    duration: ticksToLabel(item.runTimeTicks) ?? '',
    poster: gradientFor(item.id),
    watched: item.playedPercentage != null && item.playedPercentage >= 0.9,
    progress:
      item.playedPercentage && item.playedPercentage < 0.9 ? item.playedPercentage : undefined,
    danmaku: 'unmatched',
  }
}

export function embyServerToView(server: EmbyServer): Server {
  const accent = SERVER_ACCENTS[hashIndex(server.id, SERVER_ACCENTS.length)]
  return {
    id: server.id,
    name: server.name,
    address: stripProtocol(server.baseUrl),
    baseUrl: server.baseUrl,
    initial: server.name.trim().charAt(0) || '·',
    accentFrom: accent[0],
    accentTo: accent[1],
    status: 'connected',
  }
}
