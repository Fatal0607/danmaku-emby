import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type {
  DanmakuEpisode,
  DanmakuMatchInput,
  DanmakuSeriesMatchInput,
} from '@shared/types/danmaku'
import type { DanmakuStatus } from '@shared/types/domain'
import { BackToTop } from '@/components/ui/BackToTop'
import { Icon } from '@/components/ui/Icon'
import { Button, Tag } from '@/components/ui/primitives'
import { ErrorState, PageSpinner } from '@/components/ui/States'
import { PROVIDER_LABELS } from '@/lib/danmaku'
import {
  useCurrentServerId,
  useDanmakuSeriesMatch,
  useDanmakuTrack,
  useEpisodes,
  useMediaItem,
} from '@/lib/queries'
import { DanmakuMatch } from '@/features/player/DanmakuMatch'
import './detail.css'

/** Index a season's danmaku episodes by episode number (positional fallback). */
function indexByEpisodeNumber(episodes: DanmakuEpisode[]): Map<number, DanmakuEpisode> {
  const map = new Map<number, DanmakuEpisode>()
  episodes.forEach((ep, i) => {
    const n = ep.episodeNumber ?? i + 1
    if (!map.has(n)) map.set(n, ep)
  })
  return map
}

export function Detail() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const serverId = useCurrentServerId()
  const [showMatch, setShowMatch] = useState(false)
  const { data: item, isLoading, isError, error, refetch } = useMediaItem(serverId, id)
  const isEpisodic = item != null && item.kind !== 'movie'
  const episodeSeriesId = isEpisodic ? item.seriesId ?? item.id : undefined
  const episodesQuery = useEpisodes(serverId, episodeSeriesId)
  const episodeList = episodesQuery.data ?? []

  // A movie is a single video, matched at the file level. A series is matched at
  // the season level so each episode resolves by its number (docs 04 §4.6) —
  // matching the series item as one file would pin one arbitrary episode.
  const movieMatchInput = useMemo<DanmakuMatchInput | undefined>(() => {
    if (!serverId || !item || isEpisodic) return undefined
    return {
      embyItemId: item.id,
      serverId,
      fileName: item.originalTitle ?? item.title,
      seriesTitle: item.title,
      season: item.seasonNumber,
      episode: item.episodeNumber,
      videoDurationSec: item.durationSec,
    }
  }, [item, serverId, isEpisodic])

  const seriesMatchInput = useMemo<DanmakuSeriesMatchInput | undefined>(() => {
    if (!serverId || !item || !isEpisodic || !episodeSeriesId) return undefined
    return {
      embyItemId: episodeSeriesId,
      serverId,
      seriesTitle: item.originalTitle ?? item.title,
      season: item.seasonNumber,
      year: item.year > 0 ? item.year : undefined,
      episodeCount: episodeList.length || undefined,
    }
  }, [item, serverId, isEpisodic, episodeSeriesId, episodeList.length])

  const movieQuery = useDanmakuTrack(movieMatchInput)
  const seriesQuery = useDanmakuSeriesMatch(seriesMatchInput)
  const track = movieQuery.data
  const seriesMatch = seriesQuery.data

  const isMatching = isEpisodic ? seriesQuery.isFetching : movieQuery.isFetching
  const isMatched = isEpisodic ? !!seriesMatch : !!track
  const danmakuStatus: DanmakuStatus = isMatched
    ? 'matched'
    : isMatching
      ? 'matching'
      : item?.danmaku.status ?? 'unmatched'
  const providerLabel = isEpisodic
    ? seriesMatch
      ? PROVIDER_LABELS[seriesMatch.provider]
      : item?.danmaku.provider
    : track
      ? PROVIDER_LABELS[track.provider]
      : item?.danmaku.provider

  // Map each Emby episode to its danmaku episode by number, for per-row status.
  const danmakuEpByNumber = useMemo(
    () => indexByEpisodeNumber(seriesMatch?.episodes ?? []),
    [seriesMatch],
  )

  if (isLoading) return <PageSpinner label="加载详情…" />
  if (isError || !item) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div className="detail">
      {/* Sticky back control — stays pinned top-left while the page scrolls */}
      <div className="detail-back-slot">
        <button className="detail-back" onClick={() => navigate(-1)} aria-label="返回">
          <Icon name="back" size={18} color="var(--text-soft)" />
        </button>
      </div>

      {/* Backdrop hero */}
      <div
        className="detail-hero"
        style={{ background: `linear-gradient(135deg, ${item.poster[0]}, ${item.poster[1]})` }}
      >
        {item.posterUrl && <img className="detail-hero-bg" src={item.posterUrl} alt="" />}
        <div className="detail-hero-scrim" />
      </div>

      <div className="detail-body">
        <div
          className="detail-poster"
          style={{ background: `linear-gradient(150deg, ${item.poster[0]}, ${item.poster[1]})` }}
        >
          {item.posterUrl && <img className="detail-poster-img" src={item.posterUrl} alt={item.title} />}
        </div>

        <div className="detail-main">
          <h1 className="detail-title">{item.title}</h1>
          {item.originalTitle && <div className="detail-original">{item.originalTitle}</div>}

          <div className="detail-meta">
            {item.rating != null && (
              <span className="detail-rating">
                <Icon name="star" size={15} color="#f0b042" /> {item.rating}
              </span>
            )}
            {item.year > 0 && <span>{item.year}</span>}
            {item.quality && <Tag tone="accent">{item.quality}</Tag>}
          </div>

          <div className="detail-tags">
            {item.genres.map((g) => (
              <Tag key={g}>{g}</Tag>
            ))}
          </div>

          {/* Danmaku match status banner */}
          <div className={`dm-status dm-status-${danmakuStatus}`}>
            <div className="dm-status-icon">
              <Icon name="danmaku" size={18} color="currentColor" />
            </div>
            <div className="dm-status-text">
              {danmakuStatus === 'matched' &&
                (isEpisodic && seriesMatch ? (
                  <>
                    <strong>整季弹幕已匹配</strong>
                    <span>
                      {seriesMatch.seasonTitle ? `${seriesMatch.seasonTitle} · ` : ''}
                      {providerLabel} · 全 {seriesMatch.episodes.length} 集 · 按集自动套用
                    </span>
                  </>
                ) : (
                  <>
                    <strong>弹幕已匹配</strong>
                    <span>
                      {providerLabel} ·{' '}
                      {(track?.commentCount ?? item.danmaku.count ?? 0).toLocaleString()} 条
                    </span>
                  </>
                ))}
              {danmakuStatus === 'matching' && (
                <>
                  <strong>正在匹配弹幕…</strong>
                  <span>自动检索弹弹play / B站 / 腾讯</span>
                </>
              )}
              {danmakuStatus === 'unmatched' && (
                <>
                  <strong>尚未匹配弹幕</strong>
                  <span>{isEpisodic ? '手动选择整季弹幕来源' : '手动选择剧集以叠加弹幕'}</span>
                </>
              )}
            </div>
            <button
              className="dm-status-action"
              onClick={() => setShowMatch(true)}
              disabled={!serverId}
            >
              {danmakuStatus === 'unmatched' ? '立即匹配' : '更换匹配'}
            </button>
          </div>

          {item.overview && <p className="detail-overview">{item.overview}</p>}

          <div className="detail-actions">
            <Button onClick={() => navigate(`/player/${item.id}`)}>
              <Icon name="play" size={16} color="#fff" />
              {item.progress != null ? '继续观看' : '播放'}
            </Button>
            <Button variant="secondary">加入收藏</Button>
          </div>
        </div>
      </div>

      {/* Episodes */}
      {isEpisodic && (
        <section className="detail-episodes">
          <div className="row-head" style={{ marginBottom: 18 }}>
            <span className="row-title">剧集 · 第 {item.seasonNumber ?? 1} 季</span>
            <span className="row-more">
              {episodesQuery.isLoading ? '加载中…' : `共 ${episodeList.length} 集`}
            </span>
          </div>
          <div className="episode-grid">
            {episodeList.map((ep) => {
              // Once the season is matched, each episode resolves by its number;
              // until then fall back to the catalog's own danmaku hint.
              const dmEp = danmakuEpByNumber.get(ep.number)
              const dmStatus: DanmakuStatus = dmEp
                ? 'matched'
                : seriesQuery.isFetching
                  ? 'matching'
                  : seriesMatch
                    ? 'unmatched'
                    : ep.danmaku
              const dmTitle = dmEp ? `弹幕：${dmEp.title}` : '未匹配'
              return (
                <button
                  key={ep.id}
                  className="episode-card"
                  onClick={() => navigate(`/player/${ep.id}`)}
                >
                  <div
                    className="episode-thumb"
                    style={{
                      background: `linear-gradient(150deg, ${ep.poster[0]}, ${ep.poster[1]})`,
                    }}
                  >
                    {ep.watched && (
                      <span className="episode-watched">
                        <Icon name="check" size={12} color="#fff" />
                      </span>
                    )}
                    {ep.progress != null && (
                      <div className="episode-progress">
                        <div style={{ width: `${ep.progress * 100}%` }} />
                      </div>
                    )}
                    <span className="episode-play">
                      <Icon name="play" size={16} color="#fff" />
                    </span>
                    <span className="episode-duration">{ep.duration}</span>
                  </div>
                  <div className="episode-info">
                    <span className="episode-num">
                      {ep.number}. {ep.title}
                    </span>
                    <span className={`episode-dm episode-dm-${dmStatus}`} title={dmTitle}>
                      {dmStatus === 'matched'
                        ? '弹幕'
                        : dmStatus === 'matching'
                          ? '匹配中'
                          : '—'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {showMatch && (
        <DanmakuMatch
          mode={isEpisodic ? 'series' : 'episode'}
          onClose={() => setShowMatch(false)}
          serverId={serverId ?? ''}
          embyItemId={isEpisodic ? episodeSeriesId ?? item.id : item.id}
          defaultQuery={item.title}
        />
      )}

      <BackToTop />
    </div>
  )
}
