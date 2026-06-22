import { useNavigate } from 'react-router-dom'
import { catalog } from '@/lib/mockData'
import { PosterCard } from '@/components/media/PosterCard'
import { Icon } from '@/components/ui/Icon'
import { Tag, Button } from '@/components/ui/primitives'
import '@/styles/page.css'
import './home.css'

export function Home() {
  const navigate = useNavigate()
  const hero = catalog[0]
  const continueWatching = catalog.filter((c) => c.progress != null)
  const recent = catalog

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

      {/* Hero banner */}
      <section
        className="hero"
        style={{ background: `linear-gradient(110deg, ${hero.poster[0]}, ${hero.poster[1]})` }}
      >
        <div className="hero-scrim" />
        <div className="hero-body">
          <div className="hero-tags">
            <Tag tone="accent">{hero.quality}</Tag>
            <Tag tone="success" dot>
              弹幕已匹配 · {(hero.danmaku.count! / 10000).toFixed(1)}万条
            </Tag>
          </div>
          <h2 className="hero-title">{hero.title}</h2>
          <div className="hero-meta">
            <span className="hero-rating">
              <Icon name="star" size={14} color="#f0b042" /> {hero.rating}
            </span>
            <span>{hero.year}</span>
            <span>{hero.genres.join(' · ')}</span>
          </div>
          <p className="hero-overview">{hero.overview}</p>
          <div className="hero-actions">
            <Button onClick={() => navigate(`/player/${hero.id}`)}>
              <Icon name="play" size={16} color="#fff" /> 继续观看 · {hero.durationLabel}
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/detail/${hero.id}`)}>
              详情
            </Button>
          </div>
          <div className="hero-progress">
            <div className="hero-progress-fill" style={{ width: `${hero.progress! * 100}%` }} />
          </div>
        </div>
      </section>

      {/* Continue watching */}
      <section className="content-row">
        <div className="row-head">
          <span className="row-title">继续观看</span>
          <span className="row-more">查看全部</span>
        </div>
        <div className="row-rail">
          {continueWatching.map((item) => (
            <PosterCard key={item.id} item={item} width={210} showProgress />
          ))}
        </div>
      </section>

      {/* Recently added */}
      <section className="content-row">
        <div className="row-head">
          <span className="row-title">最近添加</span>
          <span className="row-more">查看全部</span>
        </div>
        <div className="row-rail">
          {recent.map((item) => (
            <PosterCard key={item.id} item={item} width={190} />
          ))}
        </div>
      </section>
    </div>
  )
}
