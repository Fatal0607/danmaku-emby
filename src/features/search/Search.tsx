import { useState } from 'react'
import { catalog } from '@/lib/mockData'
import { PosterCard } from '@/components/media/PosterCard'
import { Icon } from '@/components/ui/Icon'
import '@/styles/page.css'
import './search.css'

const SUGGESTIONS = ['星海彼端', '科幻', '4K HDR', '弹弹play', '2024 新番']

export function Search() {
  const [query, setQuery] = useState('')
  const results = query
    ? catalog.filter(
        (c) =>
          c.title.includes(query) ||
          c.genres.some((g) => g.includes(query)) ||
          (c.quality?.includes(query) ?? false),
      )
    : catalog

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
        <span className="row-more">{results.length} 项</span>
      </div>

      {results.length ? (
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
