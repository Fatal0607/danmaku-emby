import { useParams, useNavigate } from 'react-router-dom'
import type { MediaKind } from '@shared/types/domain'
import { catalog } from '@/lib/mockData'
import { PosterCard } from '@/components/media/PosterCard'
import { Icon } from '@/components/ui/Icon'
import { Segmented } from '@/components/ui/primitives'
import '@/styles/page.css'

const KIND_LABEL: Record<MediaKind, string> = {
  movie: '电影',
  series: '剧集',
  anime: '动漫',
}

export function Library() {
  const { kind } = useParams<{ kind: MediaKind }>()
  const navigate = useNavigate()
  const k = (kind ?? 'movie') as MediaKind
  // Repeat the mock catalog so the grid feels populated.
  const base = catalog.filter((c) => c.kind === k)
  const items = base.length ? [...base, ...catalog, ...catalog].slice(0, 18) : catalog

  return (
    <div className="page">
      <div className="page-topbar">
        <div>
          <div className="page-eyebrow">资源库 · {items.length} 部</div>
          <h1 className="page-title">{KIND_LABEL[k]}</h1>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Segmented
            value="recent"
            options={[
              { value: 'recent', label: '最近' },
              { value: 'name', label: '名称' },
              { value: 'rating', label: '评分' },
            ]}
          />
          <button className="topbar-search" onClick={() => navigate('/search')}>
            <Icon name="search" size={16} color="var(--text-muted)" />
            筛选 {KIND_LABEL[k]}
          </button>
        </div>
      </div>

      <div className="media-grid">
        {items.map((item, i) => (
          <PosterCard key={`${item.id}-${i}`} item={item} width={200} showProgress />
        ))}
      </div>
    </div>
  )
}
