import { useState } from 'react'
import { PosterCard } from '@/components/media/PosterCard'
import { Icon } from '@/components/ui/Icon'
import { ErrorState, PosterSkeleton } from '@/components/ui/States'
import { useDebounce } from '@/hooks/useDebounce'
import { useCurrentServerId, useSearch } from '@/lib/queries'
import '@/styles/page.css'
import './search.css'

const SUGGESTIONS = ['星海彼端', '科幻', '4K HDR', '弹弹play', '2024 新番']

export function Search() {
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query, 250)
  const serverId = useCurrentServerId()
  const { data: results = [], isLoading, isError, error, refetch } = useSearch(serverId, debounced)

  return (
    <div className="page search-page">
      <div className="search-bar">
        <Icon name="search" size={22} color="var(--text-muted)" />
        <input
          className="search-input"
          autoFocus
          placeholder="搜索影片、剧集、番剧、演员…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')}>
            清除
          </button>
        )}
      </div>

      <div className="search-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="suggest-chip" onClick={() => setQuery(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="row-head" style={{ marginTop: 12 }}>
        <span className="row-title">{query ? `“${query}” 的结果` : '推荐内容'}</span>
        <span className="row-more">{isLoading ? '搜索中…' : `${results.length} 项`}</span>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="media-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <PosterSkeleton key={i} width={200} />
          ))}
        </div>
      ) : results.length ? (
        <div className="media-grid">
          {results.map((item) => (
            <PosterCard key={item.id} item={item} width={200} />
          ))}
        </div>
      ) : (
        <div className="search-empty">
          <Icon name="search" size={40} color="var(--text-faint)" />
          <div>没有找到与 “{query}” 匹配的内容</div>
        </div>
      )}
    </div>
  )
}
