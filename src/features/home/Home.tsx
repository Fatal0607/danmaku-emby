import { useNavigate } from 'react-router-dom'
import type { MediaItem } from '@shared/types/domain'
import { PosterCard } from '@/components/media/PosterCard'
import { Icon } from '@/components/ui/Icon'
import { Tag, Button } from '@/components/ui/primitives'
import { SkeletonRow } from '@/components/ui/States'
import { useContinueWatching, useCurrentServerId, useRecentlyAdded } from '@/lib/queries'
import '@/styles/page.css'
import './home.css'

export function Home() {
  const navigate = useNavigate()
  const serverId = useCurrentServerId()
  const cw = useContinueWatching(serverId)
  const recent = useRecentlyAdded(serverId)

  const continueWatching = cw.data ?? []
  const recentItems = recent.data ?? []
  const hero = continueWatching[0] ?? recentItems[0]

  return (
    <div className="page home">
      <div className="page-topbar">
        <div>
          <div className="page-eyebrow">下午好,cinephile</div>
          <h1 className="page-title">首页</h1>
        </div>
        <button className="topbar-search" onClick={() => navigate('/search')}>
          <Icon name="search" size={16} color="var(--text-muted)" />
          搜索影片、剧集、番剧
        </button>
      </div>

      {hero ? (
        <HeroBanner item={hero} onPlay={() => navigate(`/player/${hero.id}`)} onDetail={() => navigate(`/detail/${hero.id}`)} />
      ) : (
        <div className="hero hero-skeleton" />
      )}

      <section className="content-row">
        <div className="row-head">
          <span className="row-title">继续观看</span>
          <span className="row-more">查看全部</span>
        </div>
        {cw.isLoading ? (
          <SkeletonRow width={210} />
        ) : (
          <div className="row-rail">
            {continueWatching.map((item) => (
              <PosterCard key={item.id} item={item} width={210} showProgress />
            ))}
          </div>
        )}
      </section>

      <section className="content-row">
        <div className="row-head">
          <span className="row-title">最近添加</span>
          <span className="row-more">查看全部</span>
        </div>
        {recent.isLoading ? (
          <SkeletonRow width={190} />
        ) : (
          <div className="row-rail">
            {recentItems.map((item) => (
              <PosterCard key={item.id} item={item} width={190} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

interface HeroBannerProps {
  item: MediaItem
  onPlay: () => void
  onDetail: () => void
}

function HeroBanner({ item, onPlay, onDetail }: HeroBannerProps) {
  const matched = item.danmaku.status === 'matched' && item.danmaku.count != null
  return (
    <section
      className="hero"
      style={{ background: `linear-gradient(110deg, ${item.poster[0]}, ${item.poster[1]})` }}
    >
      {item.posterUrl && <img className="hero-bg" src={item.posterUrl} alt="" />}
      <div className="hero-scrim" />
      <div className="hero-body">
        <div className="hero-tags">
          {item.quality && <Tag tone="accent">{item.quality}</Tag>}
          {matched ? (
            <Tag tone="success" dot>
              弹幕已匹配 · {(item.danmaku.count! / 10000).toFixed(1)}万条
            </Tag>
          ) : (
            <Tag>未匹配弹幕</Tag>
          )}
        </div>
        <h2 className="hero-title">{item.title}</h2>
        <div className="hero-meta">
          {item.rating != null && (
            <span className="hero-rating">
              <Icon name="star" size={14} color="#f0b042" /> {item.rating}
            </span>
          )}
          {item.year > 0 && <span>{item.year}</span>}
          {item.genres.length > 0 && <span>{item.genres.join(' · ')}</span>}
        </div>
        {item.overview && <p className="hero-overview">{item.overview}</p>}
        <div className="hero-actions">
          <Button onClick={onPlay}>
            <Icon name="play" size={16} color="#fff" />
            {item.durationLabel ? `继续观看 · ${item.durationLabel}` : item.progress != null ? '继续观看' : '播放'}
          </Button>
          <Button variant="secondary" onClick={onDetail}>
            详情
          </Button>
        </div>
        {item.progress != null && (
          <div className="hero-progress">
            <div className="hero-progress-fill" style={{ width: `${item.progress * 100}%` }} />
          </div>
        )}
      </div>
    </section>
  )
}
