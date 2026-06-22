import { useNavigate } from 'react-router-dom'
import type { MediaItem } from '@shared/types/domain'
import { Icon } from '@/components/ui/Icon'
import './poster-card.css'

const DM_LABEL: Record<MediaItem['danmaku']['status'], { cls: string; text: string }> = {
  matched: { cls: 'dm-matched', text: '弹幕' },
  matching: { cls: 'dm-matching', text: '匹配中' },
  unmatched: { cls: 'dm-unmatched', text: '未匹配' },
}

export function PosterCard({
  item,
  width = 200,
  showProgress = false,
}: {
  item: MediaItem
  width?: number
  showProgress?: boolean
}) {
  const navigate = useNavigate()
  const dm = DM_LABEL[item.danmaku.status]
  return (
    <article
      className="poster-card"
      style={{ width }}
      onClick={() => navigate(`/detail/${item.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/detail/${item.id}`)}
    >
      <div
        className="poster-art"
        style={{
          height: width * 1.5,
          background: `linear-gradient(150deg, ${item.poster[0]}, ${item.poster[1]})`,
        }}
      >
        {item.posterUrl && (
          <img
            className="poster-img"
            src={item.posterUrl}
            alt={item.title}
            width={width}
            height={Math.round(width * 1.5)}
            loading="lazy"
          />
        )}
        <span className={`dm-badge ${dm.cls}`}>
          {item.danmaku.status === 'matched' && <span className="dm-badge-dot" />}
          {dm.text}
        </span>
        {item.quality && <span className="quality-badge">{item.quality}</span>}

        <div className="poster-overlay">
          <button className="poster-play" aria-label="播放">
            <Icon name="play" size={20} color="#fff" />
          </button>
        </div>

        {showProgress && item.progress != null && (
          <div className="poster-progress">
            <div className="poster-progress-fill" style={{ width: `${item.progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="poster-info">
        <div className="poster-title">{item.title}</div>
        <div className="poster-sub">
          {item.episodeLabel ? item.episodeLabel : `${item.year} · ${item.genres[0]}`}
        </div>
      </div>
    </article>
  )
}
