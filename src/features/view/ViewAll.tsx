import { useLayoutEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PosterCard } from '@/components/media/PosterCard'
import { BackToTop } from '@/components/ui/BackToTop'
import { Icon } from '@/components/ui/Icon'
import { ErrorState, PosterSkeleton } from '@/components/ui/States'
import { scrollAppContentToTop } from '@/lib/pageScroll'
import { useCurrentServerId, useViewSection } from '@/lib/queries'
import '@/styles/page.css'

export function ViewAll() {
  const { viewId = '' } = useParams<{ viewId: string }>()
  const navigate = useNavigate()
  const serverId = useCurrentServerId()
  const { data: section, isLoading, isError, error, refetch } = useViewSection(serverId, viewId)
  const items = section?.items ?? []
  const loading = isLoading || !serverId

  useLayoutEffect(() => {
    scrollAppContentToTop()
  }, [viewId])

  return (
    <div className="page">
      <div className="page-topbar page-topbar-sticky">
        <div className="page-titleline">
          <button className="page-back-button" onClick={() => navigate(-1)} aria-label="返回">
            <Icon name="back" size={18} color="#fff" />
          </button>
          <div>
            <div className="page-eyebrow">
              Emby 资源库 · {loading ? '…' : `${items.length} 项`}
            </div>
            <h1 className="page-title">{section?.title ?? '资源库'}</h1>
          </div>
        </div>
        <button className="topbar-search" onClick={() => navigate('/search')}>
          <Icon name="search" size={16} color="var(--text-muted)" />
          搜索当前服务器
        </button>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : loading ? (
        <div className="media-grid">
          {Array.from({ length: 18 }, (_, i) => (
            <PosterSkeleton key={i} width={200} />
          ))}
        </div>
      ) : items.length ? (
        <div className="media-grid">
          {items.map((item, i) => (
            <PosterCard key={`${item.id}-${i}`} item={item} width={200} showProgress />
          ))}
        </div>
      ) : (
        <div className="page-empty">
          <Icon name="film" size={34} color="var(--text-faint)" />
          <span>这里暂时没有可展示的内容</span>
        </div>
      )}

      <BackToTop />
    </div>
  )
}
