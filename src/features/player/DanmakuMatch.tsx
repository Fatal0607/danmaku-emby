import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/primitives'
import './danmaku-match.css'

interface MatchCandidate {
  id: string
  title: string
  meta: string
  provider: string
  count: number
  confidence: number
}

const CANDIDATES: MatchCandidate[] = [
  { id: 'm1', title: '星海彼端', meta: '剧场版 · 2024', provider: '弹弹play', count: 12480, confidence: 0.98 },
  { id: 'm2', title: '星海彼端 剧场版', meta: '1 集 · 剧场版', provider: '哔哩哔哩', count: 9320, confidence: 0.86 },
  { id: 'm3', title: 'Beyond the Star Sea', meta: '12 集 · TV动画', provider: '弹弹play', count: 24180, confidence: 0.64 },
  { id: 'm4', title: '星海的彼端', meta: '24 集 · TV动画', provider: '腾讯视频', count: 18040, confidence: 0.41 },
]

export function DanmakuMatch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('星海彼端')
  const [selected, setSelected] = useState('m1')

  return (
    <div className="match-backdrop" onClick={onClose}>
      <div className="match-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="弹幕手动匹配">
        <div className="match-head">
          <div>
            <div className="match-title">手动匹配弹幕</div>
            <div className="match-sub">为「星海彼端」选择正确的弹幕来源</div>
          </div>
          <button className="match-close" onClick={onClose} aria-label="关闭">
            <Icon name="plus" size={18} color="var(--text-muted)" style={{ transform: 'rotate(45deg)' }} />
          </button>
        </div>

        <div className="match-search">
          <Icon name="search" size={18} color="var(--text-muted)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索弹幕库标题…"
          />
          <span className="match-provider-pill">全部来源</span>
        </div>

        <div className="match-list">
          {CANDIDATES.map((c) => (
            <button
              key={c.id}
              className={`match-item${selected === c.id ? ' is-selected' : ''}`}
              onClick={() => setSelected(c.id)}
            >
              <span className="match-radio">
                {selected === c.id && <span className="match-radio-dot" />}
              </span>
              <span className="match-item-main">
                <span className="match-item-title">{c.title}</span>
                <span className="match-item-meta">
                  {c.meta} · {c.provider}
                </span>
              </span>
              <span className="match-item-count">{c.count.toLocaleString()} 条</span>
              <span
                className="match-confidence"
                data-level={c.confidence > 0.9 ? 'high' : c.confidence > 0.6 ? 'mid' : 'low'}
              >
                {Math.round(c.confidence * 100)}%
              </span>
            </button>
          ))}
        </div>

        <div className="match-foot">
          <span className="match-foot-hint">匹配将记忆到本季,后续剧集自动套用</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button onClick={onClose}>应用匹配</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
