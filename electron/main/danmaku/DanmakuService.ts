import type {
  DanmakuEpisode,
  DanmakuMapping,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
  DanmakuSeriesMatch,
  DanmakuSeriesMatchInput,
  DanmakuTrack,
  RememberEpisodesInput,
} from '@shared/types/danmaku'
import type { DanmakuCacheRepo, DanmakuMapRepo } from '../store/repositories/DanmakuRepos'
import { toAss, type AssOptions } from './render/toAss'
import { DanmakuError } from './errors'
import { MatchService } from './MatchService'
import type { ProviderInfo, ProviderRegistry } from './ProviderRegistry'

const DEFAULT_PROVIDER_CONFIG_ID = 'default'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Business orchestration (docs 04 §4.7) across multiple providers: routes by
// mapping.provider, cache-first fetch, mapping memory, and {p,m}→ASS rendering.
// Pulling failures fall back to stale cache so a downloaded track keeps playing
// (docs 05 §5.5).

export class DanmakuService {
  private readonly match: MatchService

  constructor(
    private readonly registry: ProviderRegistry,
    mapRepo: DanmakuMapRepo,
    private readonly cacheRepo: DanmakuCacheRepo,
  ) {
    this.match = new MatchService(registry, mapRepo)
  }

  listProviders(): ProviderInfo[] {
    return this.registry.list()
  }

  /** Auto-match an Emby item and return its danmaku, or null if unmatched. */
  async autoMatchAndFetch(input: DanmakuMatchInput): Promise<DanmakuTrack | null> {
    const mapping = await this.match.autoMatch(input)
    if (!mapping) return null
    return this.getDanmaku(mapping)
  }

  /** Auto-match a whole series to a danmaku season + its episode list. */
  async autoMatchSeries(input: DanmakuSeriesMatchInput): Promise<DanmakuSeriesMatch | null> {
    const mapping = await this.match.autoMatchSeries(input)
    if (!mapping) return null
    return this.buildSeriesMatch(mapping)
  }

  /** Persist a manual series→season choice and return its episode list. */
  async saveManualSeries(args: {
    provider: ProviderId
    serverId: string
    embyItemId: string
    seasonId: string
    seasonTitle?: string
  }): Promise<DanmakuSeriesMatch> {
    const mapping = this.match.saveManualSeries(args)
    return this.buildSeriesMatch(mapping)
  }

  /** Persist resolved episode→source rows so matches survive without re-resolving. */
  rememberEpisodes(input: RememberEpisodesInput): number {
    return this.match.rememberEpisodes(input)
  }

  private async buildSeriesMatch(mapping: DanmakuMapping): Promise<DanmakuSeriesMatch> {
    const episodes = await this.episodes(mapping.provider, mapping.seasonId)
    return {
      provider: mapping.provider,
      seasonId: mapping.seasonId,
      seasonTitle: mapping.seasonTitle ?? '',
      source: mapping.source,
      episodes,
    }
  }

  /** Fetch danmaku for a mapping, using cache unless stale or forced. */
  async getDanmaku(mapping: DanmakuMapping, forceUpdate = false): Promise<DanmakuTrack> {
    const cached = this.cacheRepo.find(mapping.provider, mapping.seasonId, mapping.indexedId)
    const fresh = cached && Date.now() - cached.lastChecked < CACHE_TTL_MS
    if (cached && fresh && !forceUpdate) return cached

    const provider = this.registry.get(mapping.provider)
    if (!provider) {
      // Provider disabled/removed: keep showing cached danmaku if we have it.
      if (cached) return cached
      throw new DanmakuError('DM_PARSE_FAILED', `弹幕源 ${mapping.provider} 未启用`)
    }

    try {
      const comments = await provider.getComments(mapping.indexedId)
      const track: DanmakuTrack = {
        provider: mapping.provider,
        providerConfigId: DEFAULT_PROVIDER_CONFIG_ID,
        indexedId: mapping.indexedId,
        seasonId: mapping.seasonId,
        comments,
        commentCount: comments.length,
        lastChecked: Date.now(),
      }
      this.cacheRepo.upsert(track)
      return track
    } catch (e) {
      if (cached) return cached
      throw e
    }
  }

  search(provider: ProviderId, keyword: string): Promise<DanmakuSeason[]> {
    return this.requireProvider(provider).search(keyword)
  }

  episodes(provider: ProviderId, seasonId: string): Promise<DanmakuEpisode[]> {
    return this.requireProvider(provider).episodes(seasonId)
  }

  /** Record a manual selection and pull its danmaku (manual overrides auto). */
  async fetchManual(args: {
    provider: ProviderId
    serverId: string
    embyItemId: string
    seasonId: string
    indexedId: string
  }): Promise<DanmakuTrack> {
    const mapping = this.match.saveManual(args)
    return this.getDanmaku(mapping, true)
  }

  toAss(comments: DanmakuTrack['comments'], opts: Partial<AssOptions> = {}): string {
    if (!comments.length) {
      throw new DanmakuError('DM_PARSE_FAILED', '弹幕为空')
    }
    return toAss(comments, opts)
  }

  private requireProvider(id: ProviderId) {
    const provider = this.registry.get(id)
    if (!provider) {
      throw new DanmakuError('DM_PARSE_FAILED', `弹幕源 ${id} 未启用`)
    }
    return provider
  }
}
