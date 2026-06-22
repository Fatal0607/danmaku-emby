import { useParams, useNavigate } from 'react-router-dom'
import type { MediaKind } from '@shared/types/domain'
import { PosterCard } from '@/components/media/PosterCard'
import { Icon } from '@/components/ui/Icon'
import { Segmented } from '@/components/ui/primitives'
import { ErrorState, PosterSkeleton } from '@/components/ui/States'
import { useCurrentServerId, useLibrary } from '@/lib/queries'
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
  const serverId = useCurrentServerId()
  const { data: items = [], isLoading, isError, error, refetch } = useLibrary(serverId, k)

  return (
    <div className="page">
      <div className="page-topbar">
        <div>
          <div className="page-eyebrow">资源库 · {isLoading ? '…' : `${items.length} 部`}</div>
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

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="media-grid">
          {isLoading
            ? Array.from({ length: 12 }, (_, i) => <PosterSkeleton key={i} width={200} />)
            : items.map((item, i) => (
                <PosterCard key={`${item.id}-${i}`} item={item} width={200} showProgress />
              ))}
        </div>
      )}
    </div>
  )
}
