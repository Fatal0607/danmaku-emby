import type {
  DanmakuEpisode,
  DanmakuMapping,
  DanmakuMatchInput,
  DanmakuSeason,
  DanmakuTrack,
} from '@shared/types/danmaku'
import type { DanmakuCacheRepo, DanmakuMapRepo } from '../store/repositories/DanmakuRepos'
import { toAss, type AssOptions } from './render/toAss'
import { DanmakuError } from './errors'
import { MatchService } from './MatchService'
import type { DanmakuSourceProvider } from './providers/DanmakuProvider'

const DEFAULT_PROVIDER_CONFIG_ID = 'dandanplay-default'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Business orchestration (docs 04 §4.7): cache-first fetch, mapping memory, and
// {p,m}→ASS rendering. Pulling failures fall back to stale cache so a downloaded
// track keeps playing (docs 05 §5.5).

export class DanmakuService {
  private readonly match: MatchService

  constructor(
    private readonly provider: DanmakuSourceProvider,
    mapRepo: DanmakuMapRepo,
    private readonly cacheRepo: DanmakuCacheRepo,
  ) {
    this.match = new MatchService(provider, mapRepo)
  }

  /** Auto-match an Emby item and return its danmaku, or null if unmatched. */
  async autoMatchAndFetch(input: DanmakuMatchInput): Promise<DanmakuTrack | null> {
    const mapping = await this.match.autoMatch(input)
    if (!mapping) return null
    return this.getDanmaku(mapping)
  }

  /** Fetch danmaku for a mapping, using cache unless stale or forced. */
  async getDanmaku(mapping: DanmakuMapping, forceUpdate = false): Promise<DanmakuTrack> {
    const cached = this.cacheRepo.find(mapping.provider, mapping.seasonId, mapping.indexedId)
    const fresh = cached && Date.now() - cached.lastChecked < CACHE_TTL_MS
    if (cached && fresh && !forceUpdate) return cached

    try {
      const comments = await this.provider.getComments(mapping.indexedId)
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
      // Re-fetch failed: keep playing the cached track if we have one.
      if (cached) return cached
      throw e
    }
  }

  search(keyword: string): Promise<DanmakuSeason[]> {
    return this.provider.search(keyword)
  }

  episodes(seasonId: string): Promise<DanmakuEpisode[]> {
    return this.provider.episodes(seasonId)
  }

  /** Record a manual selection and pull its danmaku (manual overrides auto). */
  async fetchManual(args: {
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
}
