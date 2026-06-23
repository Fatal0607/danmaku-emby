import type {
  CommentEntity,
  DanmakuEpisode,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
} from '@shared/types/danmaku'

// Provider abstraction (docs 04 §4.1). dandanplay is the MVP provider; bilibili
// and tencent implement the same surface later. Business code (MatchService /
// DanmakuService) depends only on this interface.

export interface DanmakuSourceProvider {
  readonly id: ProviderId

  /** Auto-match an Emby file to a platform episode (dandanplay /match). */
  match(input: DanmakuMatchInput): Promise<DanmakuEpisode | null>

  /** Keyword search → seasons. */
  search(keyword: string): Promise<DanmakuSeason[]>

  /** Episodes within a season (platform season/anime id). */
  episodes(seasonId: string): Promise<DanmakuEpisode[]>

  /** Pull the comment list for a platform episode id. */
  getComments(indexedId: string): Promise<CommentEntity[]>
}
