import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MediaItem, MediaSection } from '@shared/types/domain'
import { PosterCard } from '@/components/media/PosterCard'
import { Icon } from '@/components/ui/Icon'
import { Tag, Button } from '@/components/ui/primitives'
import { SkeletonRow } from '@/components/ui/States'
import {
  useContinueWatching,
  useCurrentServerId,
  useHomeSections,
  useRecentlyAdded,
} from '@/lib/queries'
import { scrollRailByPage } from '@/lib/scrollRail'
import '@/styles/page.css'
import './home.css'

export function Home() {
  const navigate = useNavigate()
  const serverId = useCurrentServerId()
  const cw = useContinueWatching(serverId)
  const recent = useRecentlyAdded(serverId)
  const sectionsQuery = useHomeSections(serverId)

  const continueWatching = cw.data ?? []
  const recentItems = recent.data ?? []
  const homeSections = sectionsQuery.data ?? []
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
        </div>
        {cw.isLoading ? (
          <SkeletonRow width={210} />
        ) : (
          <MediaRail items={continueWatching} cardWidth={210} showProgress label="继续观看" />
        )}
      </section>

      <section className="content-row">
        <div className="row-head">
          <span className="row-title">最近添加</span>
        </div>
        {recent.isLoading ? (
          <SkeletonRow width={190} />
        ) : (
          <MediaRail items={recentItems} cardWidth={190} label="最近添加" />
        )}
      </section>

      {sectionsQuery.isLoading
        ? Array.from({ length: 3 }, (_, i) => (
            <section className="content-row" key={`home-section-skeleton-${i}`}>
              <div className="row-head">
                <span className="row-title">媒体库</span>
                <span className="row-more">加载中…</span>
              </div>
              <SkeletonRow width={190} />
            </section>
          ))
        : homeSections.map((section) => (
            <HomeSectionRow key={section.id} section={section} />
          ))}
    </div>
  )
}

function HomeSectionRow({ section }: { section: MediaSection }) {
  const navigate = useNavigate()

  return (
    <section className="content-row">
      <div className="row-head">
        <span className="row-title">{section.title}</span>
        <button
          type="button"
          className="row-more row-more-button"
          onClick={() => navigate(`/view/${section.id}`)}
        >
          查看更多
          <Icon name="chevron-right" size={14} color="currentColor" />
        </button>
      </div>
      <MediaRail items={section.items} cardWidth={190} label={section.title} />
    </section>
  )
}

function MediaRail({
  items,
  cardWidth,
  showProgress = false,
  label,
}: {
  items: MediaItem[]
  cardWidth: number
  showProgress?: boolean
  label: string
}) {
  const railRef = useRef<HTMLDivElement>(null)

  return (
    <div className="rail-shell">
      <button
        className="rail-nav rail-nav-left"
        aria-label={`${label}向左滚动`}
        onClick={() => scrollRailByPage(railRef.current, 'left')}
      >
        <Icon name="chevron-left" size={22} color="currentColor" />
      </button>
      <div className="row-rail" ref={railRef}>
        {items.map((item) => (
          <PosterCard key={item.id} item={item} width={cardWidth} showProgress={showProgress} />
        ))}
      </div>
      <button
        className="rail-nav rail-nav-right"
        aria-label={`${label}向右滚动`}
        onClick={() => scrollRailByPage(railRef.current, 'right')}
      >
        <Icon name="chevron-right" size={22} color="currentColor" />
      </button>
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
