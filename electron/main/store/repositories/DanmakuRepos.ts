import type {
  CommentEntity,
  DanmakuMapping,
  DanmakuProvider,
  DanmakuTrack,
} from '@shared/types/danmaku'
import type { DB } from '../db'

// Danmaku mapping memory + comment cache (docs 05 §5.3, §5.5).

interface MapRow {
  emby_item_id: string
  server_id: string
  provider: string
  season_id: string
  indexed_id: string
  source: string
  matched_at: number
}

const toMapping = (r: MapRow): DanmakuMapping => ({
  embyItemId: r.emby_item_id,
  serverId: r.server_id,
  provider: r.provider as DanmakuProvider,
  seasonId: r.season_id,
  indexedId: r.indexed_id,
  source: r.source === 'manual' ? 'manual' : 'auto',
  matchedAt: r.matched_at,
})

export class DanmakuMapRepo {
  constructor(private readonly db: DB) {}

  get(serverId: string, embyItemId: string): DanmakuMapping | null {
    const row = this.db
      .prepare(`SELECT * FROM danmaku_map WHERE emby_item_id = ? AND server_id = ?`)
      .get(embyItemId, serverId) as MapRow | undefined
    return row ? toMapping(row) : null
  }

  bySeries(serverId: string, provider: string, seasonId: string): DanmakuMapping[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM danmaku_map WHERE server_id = ? AND provider = ? AND season_id = ?`,
        )
        .all(serverId, provider, seasonId) as MapRow[]
    ).map(toMapping)
  }

  /**
   * Persist a mapping. A `manual` mapping is authoritative and is never
   * overwritten by a later `auto` result (docs 05 §5.5).
   */
  put(m: DanmakuMapping): void {
    const existing = this.get(m.serverId, m.embyItemId)
    if (existing?.source === 'manual' && m.source === 'auto') return
    this.db
      .prepare(
        `INSERT INTO danmaku_map
           (emby_item_id, server_id, provider, season_id, indexed_id, source, matched_at)
         VALUES (@embyItemId, @serverId, @provider, @seasonId, @indexedId, @source, @matchedAt)
         ON CONFLICT(emby_item_id, server_id) DO UPDATE SET
           provider = @provider, season_id = @seasonId, indexed_id = @indexedId,
           source = @source, matched_at = @matchedAt`,
      )
      .run({ ...m, matchedAt: m.matchedAt || Date.now() })
  }
}

interface CacheRow {
  provider: string
  provider_config_id: string
  season_id: string
  indexed_id: string
  comments: string
  comment_count: number
  last_checked: number
}

export class DanmakuCacheRepo {
  /** Soft cap on cached tracks; LRU-pruned by last_checked. */
  static readonly MAX_ENTRIES = 5000

  constructor(private readonly db: DB) {}

  find(provider: string, seasonId: string, indexedId: string): DanmakuTrack | null {
    const row = this.db
      .prepare(
        `SELECT * FROM danmaku_cache WHERE provider = ? AND season_id = ? AND indexed_id = ?`,
      )
      .get(provider, seasonId, indexedId) as CacheRow | undefined
    if (!row) return null
    let comments: CommentEntity[]
    try {
      comments = JSON.parse(row.comments) as CommentEntity[]
    } catch {
      return null
    }
    return {
      provider: row.provider as DanmakuProvider,
      providerConfigId: row.provider_config_id,
      seasonId: row.season_id,
      indexedId: row.indexed_id,
      comments,
      commentCount: row.comment_count,
      lastChecked: row.last_checked,
    }
  }

  upsert(track: DanmakuTrack): void {
    this.db
      .prepare(
        `INSERT INTO danmaku_cache
           (provider, provider_config_id, season_id, indexed_id, comments, comment_count, last_checked)
         VALUES (@provider, @providerConfigId, @seasonId, @indexedId, @comments, @commentCount, @lastChecked)
         ON CONFLICT(provider, season_id, indexed_id) DO UPDATE SET
           comments = @comments, comment_count = @commentCount,
           last_checked = @lastChecked, provider_config_id = @providerConfigId`,
      )
      .run({
        provider: track.provider,
        providerConfigId: track.providerConfigId,
        seasonId: track.seasonId,
        indexedId: track.indexedId,
        comments: JSON.stringify(track.comments),
        commentCount: track.commentCount,
        lastChecked: track.lastChecked || Date.now(),
      })
    this.enforceCap()
  }

  /** Remove entries older than the given epoch ms; returns rows deleted. */
  pruneOlderThan(epochMs: number): number {
    return this.db.prepare(`DELETE FROM danmaku_cache WHERE last_checked < ?`).run(epochMs)
      .changes
  }

  private enforceCap(): void {
    const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM danmaku_cache`).get() as {
      n: number
    }
    if (n <= DanmakuCacheRepo.MAX_ENTRIES) return
    const overflow = n - DanmakuCacheRepo.MAX_ENTRIES
    this.db
      .prepare(
        `DELETE FROM danmaku_cache WHERE rowid IN (
           SELECT rowid FROM danmaku_cache ORDER BY last_checked ASC LIMIT ?
         )`,
      )
      .run(overflow)
  }
}
