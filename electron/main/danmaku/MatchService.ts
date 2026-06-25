import type {
  DanmakuEpisode,
  DanmakuMapping,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
  DanmakuSeriesMatchInput,
} from '@shared/types/danmaku'
import type { DanmakuMapRepo } from '../store/repositories/DanmakuRepos'
import type { ProviderRegistry } from './ProviderRegistry'

// Auto-match orchestration (docs 04 §4.6): mapping memory first, then either a
// pinned series season (resolve sibling by episode number) or each enabled
// provider's /match in priority order. Manual selections are authoritative
// (the repo refuses to let 'auto' overwrite them).

/** A series row pins a season; its `indexedId` is empty (no single episode). */
function isSeriesMapping(m: DanmakuMapping): boolean {
  return m.indexedId === ''
}

export class MatchService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly mapRepo: DanmakuMapRepo,
  ) {}

  /** Resolve an Emby item to a danmaku mapping, persisting auto matches. */
  async autoMatch(input: DanmakuMatchInput): Promise<DanmakuMapping | null> {
    const remembered = this.mapRepo.get(input.serverId, input.embyItemId)
    if (remembered && !isSeriesMapping(remembered)) return remembered

    // Prefer a pinned series season: resolve this episode by its number so
    // siblings reuse one season match instead of re-running /match per file.
    const fromSeries = await this.resolveFromSeries(input)
    if (fromSeries) return fromSeries

    for (const provider of this.registry.enabledByPriority()) {
      const episode = await provider.match(input)
      if (!episode) continue
      const mapping = this.episodeMapping(input, provider.id, episode, 'auto')
      this.mapRepo.put(mapping)
      return mapping
    }
    return null
  }

  /** Resolve a whole series to a danmaku season, persisting the auto match. */
  async autoMatchSeries(input: DanmakuSeriesMatchInput): Promise<DanmakuMapping | null> {
    const remembered = this.mapRepo.get(input.serverId, input.embyItemId)
    if (remembered && isSeriesMapping(remembered)) return remembered

    for (const provider of this.registry.enabledByPriority()) {
      const seasons = await provider.search(input.seriesTitle)
      const best = pickBestSeason(seasons, input)
      if (!best) continue
      const mapping = this.seriesMapping(input, provider.id, best.indexedId, best.title, 'auto')
      this.mapRepo.put(mapping)
      return mapping
    }
    return null
  }

  /** Persist a user's manual episode choice (highest priority, overrides auto). */
  saveManual(args: {
    provider: ProviderId
    serverId: string
    embyItemId: string
    seasonId: string
    indexedId: string
  }): DanmakuMapping {
    const mapping: DanmakuMapping = {
      embyItemId: args.embyItemId,
      serverId: args.serverId,
      provider: args.provider,
      seasonId: args.seasonId,
      indexedId: args.indexedId,
      source: 'manual',
      matchedAt: Date.now(),
    }
    this.mapRepo.put(mapping)
    return mapping
  }

  /** Persist a user's manual series→season choice (overrides auto). */
  saveManualSeries(args: {
    provider: ProviderId
    serverId: string
    embyItemId: string
    seasonId: string
    seasonTitle?: string
  }): DanmakuMapping {
    const mapping: DanmakuMapping = {
      embyItemId: args.embyItemId,
      serverId: args.serverId,
      provider: args.provider,
      seasonId: args.seasonId,
      seasonTitle: args.seasonTitle,
      indexedId: '',
      source: 'manual',
      matchedAt: Date.now(),
    }
    this.mapRepo.put(mapping)
    return mapping
  }

  /** When the episode belongs to a pinned series, resolve it by number. */
  private async resolveFromSeries(input: DanmakuMatchInput): Promise<DanmakuMapping | null> {
    if (!input.seriesEmbyItemId || input.episode == null) return null
    const series = this.mapRepo.get(input.serverId, input.seriesEmbyItemId)
    if (!series || !isSeriesMapping(series)) return null

    const provider = this.registry.get(series.provider)
    if (!provider) return null
    const episodes = await provider.episodes(series.seasonId)
    const episode = pickEpisodeByNumber(episodes, input.episode)
    if (!episode) return null

    // A manual series pin makes its episodes authoritative too.
    const source = series.source === 'manual' ? 'manual' : 'auto'
    const mapping = this.episodeMapping(input, series.provider, episode, source, series.seasonId)
    this.mapRepo.put(mapping)
    return mapping
  }

  private episodeMapping(
    input: DanmakuMatchInput,
    provider: ProviderId,
    episode: DanmakuEpisode,
    source: 'auto' | 'manual',
    seasonId?: string,
  ): DanmakuMapping {
    return {
      embyItemId: input.embyItemId,
      serverId: input.serverId,
      provider,
      seasonId:
        seasonId ??
        String(episode.providerIds.animeId ?? episode.providerIds.seasonId ?? ''),
      indexedId: episode.indexedId,
      source,
      matchedAt: Date.now(),
    }
  }

  private seriesMapping(
    input: DanmakuSeriesMatchInput,
    provider: ProviderId,
    seasonId: string,
    seasonTitle: string,
    source: 'auto' | 'manual',
  ): DanmakuMapping {
    return {
      embyItemId: input.embyItemId,
      serverId: input.serverId,
      provider,
      seasonId,
      seasonTitle,
      indexedId: '',
      source,
      matchedAt: Date.now(),
    }
  }
}

/**
 * Extrapolate a sibling episode id from a known match (docs 04 §4.6).
 * dandanplay assigns consecutive episodeIds within an anime, so the target id
 * is the base id offset by the episode-number delta. Callers still verify the
 * title before trusting the result.
 */
export function extrapolateEpisodeId(
  baseEpisodeId: number,
  baseEpisodeNumber: number,
  targetEpisodeNumber: number,
): number {
  return baseEpisodeId + (targetEpisodeNumber - baseEpisodeNumber)
}

/** Strip spaces/punctuation and lowercase for tolerant title comparison. */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s·:：\-_,.，。!！?？'"]/g, '')
}

/**
 * Choose the danmaku season that best fits an Emby series (docs 04 §4.6).
 * Scores title overlap, then nudges toward seasons whose episode count and year
 * line up. Returns null when nothing shares the series title — better to fall
 * through to manual matching than to pin a wrong season.
 */
export function pickBestSeason(
  seasons: DanmakuSeason[],
  input: DanmakuSeriesMatchInput,
): DanmakuSeason | null {
  const target = normalizeTitle(input.seriesTitle)
  if (!target) return null

  let best: DanmakuSeason | null = null
  let bestScore = -Infinity
  for (const season of seasons) {
    const name = normalizeTitle(season.title)
    let score = -Infinity
    if (name === target) score = 100
    else if (name.includes(target) || target.includes(name)) score = 60
    else continue // no title overlap → not a candidate

    // A multi-episode series should not pin a single-video season (剧场版/电影).
    if ((input.episodeCount ?? 0) > 1 && season.episodeCount === 1) score -= 40
    if (input.year && season.year && input.year === season.year) score += 8
    if (
      input.episodeCount &&
      season.episodeCount &&
      input.episodeCount === season.episodeCount
    )
      score += 6

    if (score > bestScore) {
      bestScore = score
      best = season
    }
  }
  return best
}

/**
 * Find the danmaku episode for an Emby episode number. Prefers a declared
 * `episodeNumber`, then falls back to positional order (1-based).
 */
export function pickEpisodeByNumber(
  episodes: DanmakuEpisode[],
  episodeNumber: number,
): DanmakuEpisode | null {
  if (!episodes.length) return null
  const byNumber = episodes.find((e) => e.episodeNumber === episodeNumber)
  if (byNumber) return byNumber
  return episodes[episodeNumber - 1] ?? null
}
