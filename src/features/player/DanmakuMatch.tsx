import { useState } from 'react'
import type { DanmakuSeason } from '@shared/types/danmaku'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/primitives'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { PROVIDER_LABELS } from '@/lib/danmaku'
import {
  useDanmakuEpisodes,
  useDanmakuSearch,
  useFetchManualDanmaku,
} from '@/lib/queries'
import './danmaku-match.css'

interface DanmakuMatchProps {
  onClose: () => void
  serverId: string
  embyItemId: string
  defaultQuery: string
}

function seasonMeta(s: DanmakuSeason): string {
  const parts = [s.type, s.year ? `${s.year}` : undefined, PROVIDER_LABELS[s.provider]].filter(
    Boolean,
  )
  return parts.join(' · ')
}

export function DanmakuMatch({ onClose, serverId, embyItemId, defaultQuery }: DanmakuMatchProps) {
  const [query, setQuery] = useState(defaultQuery)
  const debounced = useDebouncedValue(query.trim(), 350)
  const [season, setSeason] = useState<DanmakuSeason | null>(null)
  const [episodeId, setEpisodeId] = useState<string | null>(null)

  const { data: seasons = [], isFetching: searching } = useDanmakuSearch(debounced)
  const { data: episodes = [], isFetching: loadingEpisodes } = useDanmakuEpisodes(
    season?.provider,
    season?.indexedId,
  )
  const fetchManual = useFetchManualDanmaku()

  const selectSeason = (s: DanmakuSeason) => {
    setSeason(s)
    // A single-episode season has nothing to choose — preselect it.
    setEpisodeId(s.episodeCount === 1 ? `${s.indexedId}-ep-1` : null)
  }

  const apply = () => {
    if (!season || !episodeId) return
    fetchManual.mutate(
      {
        provider: season.provider,
        serverId,
        embyItemId,
        seasonId: season.indexedId,
        indexedId: episodeId,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="match-backdrop" onClick={onClose}>
      <div className="match-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="弹幕手动匹配">
        <div className="match-head">
          <div>
            <div className="match-title">手动匹配弹幕</div>
            <div className="match-sub">为「{defaultQuery}」选择正确的弹幕来源</div>
          </div>
          <button className="match-close" onClick={onClose} aria-label="关闭">
            <Icon name="plus" size={18} color="var(--text-muted)" style={{ transform: 'rotate(45deg)' }} />
          </button>
        </div>

        <div className="match-search">
          <Icon name="search" size={18} color="var(--text-muted)" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSeason(null)
              setEpisodeId(null)
            }}
            placeholder="搜索弹幕库标题…"
          />
          <span className="match-provider-pill">{searching ? '搜索中…' : '全部来源'}</span>
        </div>

        <div className="match-list">
          {seasons.length === 0 && !searching && (
            <div className="match-empty">未找到结果,换个关键词试试</div>
          )}
          {seasons.map((s) => {
            const selected = season?.indexedId === s.indexedId
            return (
              <div key={`${s.provider}-${s.indexedId}`}>
                <button
                  className={`match-item${selected ? ' is-selected' : ''}`}
                  onClick={() => selectSeason(s)}
                >
                  <span className="match-radio">
                    {selected && <span className="match-radio-dot" />}
                  </span>
                  <span className="match-item-main">
                    <span className="match-item-title">{s.title}</span>
                    <span className="match-item-meta">{seasonMeta(s)}</span>
                  </span>
                  {s.episodeCount != null && (
                    <span className="match-item-count">{s.episodeCount} 集</span>
                  )}
                </button>

                {selected && s.episodeCount !== 1 && (
                  <div className="match-episodes">
                    {loadingEpisodes && <div className="match-empty">加载剧集…</div>}
                    {episodes.map((ep) => (
                      <button
                        key={ep.indexedId}
                        className={`match-ep${episodeId === ep.indexedId ? ' is-selected' : ''}`}
                        onClick={() => setEpisodeId(ep.indexedId)}
                      >
                        <span className="match-radio">
                          {episodeId === ep.indexedId && <span className="match-radio-dot" />}
                        </span>
                        <span className="match-ep-title">{ep.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="match-foot">
          <span className="match-foot-hint">匹配将记忆到本季,后续剧集自动套用</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button onClick={apply} disabled={!episodeId || fetchManual.isPending}>
              {fetchManual.isPending ? '应用中…' : '应用匹配'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
