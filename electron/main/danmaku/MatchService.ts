import type { DanmakuMapping, DanmakuMatchInput } from '@shared/types/danmaku'
import type { DanmakuMapRepo } from '../store/repositories/DanmakuRepos'
import type { DanmakuSourceProvider } from './providers/DanmakuProvider'

// Auto-match orchestration (docs 04 §4.6): mapping memory first, then the
// provider's /match. Manual selections are authoritative and recorded with
// source='manual' (the repo refuses to let 'auto' overwrite them).

export class MatchService {
  constructor(
    private readonly provider: DanmakuSourceProvider,
    private readonly mapRepo: DanmakuMapRepo,
  ) {}

  /** Resolve an Emby item to a danmaku mapping, persisting auto matches. */
  async autoMatch(input: DanmakuMatchInput): Promise<DanmakuMapping | null> {
    const remembered = this.mapRepo.get(input.serverId, input.embyItemId)
    if (remembered) return remembered

    const episode = await this.provider.match(input)
    if (!episode) return null

    const mapping: DanmakuMapping = {
      embyItemId: input.embyItemId,
      serverId: input.serverId,
      provider: this.provider.id,
      seasonId: String(episode.providerIds.animeId ?? ''),
      indexedId: episode.indexedId,
      source: 'auto',
      matchedAt: Date.now(),
    }
    this.mapRepo.put(mapping)
    return mapping
  }

  /** Persist a user's manual choice (highest priority, overrides auto). */
  saveManual(args: {
    serverId: string
    embyItemId: string
    seasonId: string
    indexedId: string
  }): DanmakuMapping {
    const mapping: DanmakuMapping = {
      embyItemId: args.embyItemId,
      serverId: args.serverId,
      provider: this.provider.id,
      seasonId: args.seasonId,
      indexedId: args.indexedId,
      source: 'manual',
      matchedAt: Date.now(),
    }
    this.mapRepo.put(mapping)
    return mapping
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
