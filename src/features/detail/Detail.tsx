import { useParams, useNavigate } from 'react-router-dom'
import { catalog, episodes } from '@/lib/mockData'
import { Icon } from '@/components/ui/Icon'
import { Button, Tag } from '@/components/ui/primitives'
import './detail.css'

export function Detail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const item = catalog.find((c) => c.id === id) ?? catalog[0]
  const isEpisodic = item.kind !== 'movie'

  return (
    <div className="detail">
      {/* Backdrop hero */}
      <div
        className="detail-hero"
        style={{ background: `linear-gradient(135deg, ${item.poster[0]}, ${item.poster[1]})` }}
      >
        <div className="detail-hero-scrim" />
        <button className="detail-back" onClick={() => navigate(-1)}>
          <Icon name="back" size={18} color="var(--text-soft)" />
        </button>
      </div>

      <div className="detail-body">
        <div
          className="detail-poster"
          style={{ background: `linear-gradient(150deg, ${item.poster[0]}, ${item.poster[1]})` }}
        />

        <div className="detail-main">
          <h1 className="detail-title">{item.title}</h1>
          {item.originalTitle && <div className="detail-original">{item.originalTitle}</div>}

          <div className="detail-meta">
            {item.rating && (
              <span className="detail-rating">
                <Icon name="star" size={15} color="#f0b042" /> {item.rating}
              </span>
            )}
            <span>{item.year}</span>
            {item.quality && <Tag tone="accent">{item.quality}</Tag>}
          </div>

          <div className="detail-tags">
            {item.genres.map((g) => (
              <Tag key={g}>{g}</Tag>
            ))}
          </div>

          {/* Danmaku match status banner */}
          <div className={`dm-status dm-status-${item.danmaku.status}`}>
            <div className="dm-status-icon">
              <Icon name="danmaku" size={18} color="currentColor" />
            </div>
            <div className="dm-status-text">
              {item.danmaku.status === 'matched' && (
                <>
                  <strong>弹幕已匹配</strong>
                  <span>
                    {item.danmaku.provider} · {item.danmaku.count?.toLocaleString()} 条
                  </span>
                </>
              )}
              {item.danmaku.status === 'matching' && (
                <>
                  <strong>正在匹配弹幕…</strong>
                  <span>自动检索弹弹play / B站 / 腾讯</span>
                </>
              )}
              {item.danmaku.status === 'unmatched' && (
                <>
                  <strong>尚未匹配弹幕</strong>
                  <span>手动选择剧集以叠加弹幕</span>
                </>
              )}
            </div>
            <button className="dm-status-action">
              {item.danmaku.status === 'unmatched' ? '立即匹配' : '更换匹配'}
            </button>
          </div>

          <p className="detail-overview">{item.overview}</p>

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
            <span className="row-title">剧集 · 第 1 季</span>
            <span className="row-more">共 {episodes.length} 集</span>
          </div>
          <div className="episode-grid">
            {episodes.map((ep) => (
              <button
                key={ep.id}
                className="episode-card"
                onClick={() => navigate(`/player/${item.id}`)}
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
                  <span className="episode-num">{ep.number}. {ep.title}</span>
                  <span
                    className={`episode-dm episode-dm-${ep.danmaku}`}
                    title={ep.danmakuCount ? `${ep.danmakuCount} 条弹幕` : '未匹配'}
                  >
                    {ep.danmaku === 'matched'
                      ? `${(ep.danmakuCount! / 1000).toFixed(1)}k`
                      : ep.danmaku === 'matching'
                        ? '匹配中'
                        : '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
