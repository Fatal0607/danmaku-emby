import type { MediaItem } from '@shared/types/domain'

const KIND_FALLBACK: Record<MediaItem['kind'], string> = {
  movie: '影片',
  series: '剧集',
  anime: '动漫',
}

export function formatMediaSubtitle(item: MediaItem): string {
  if (item.episodeLabel) return item.episodeLabel
  const parts = [
    item.year > 0 ? String(item.year) : undefined,
    item.genres.find(Boolean),
  ].filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(' · ') : KIND_FALLBACK[item.kind]
}
