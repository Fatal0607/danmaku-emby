import { useState } from 'react'
import type { DanmakuProvider } from '@shared/types/danmaku'
import { Icon } from '@/components/ui/Icon'
import { Toggle, Segmented, Slider, Tag } from '@/components/ui/primitives'
import { useUI } from '@/lib/store'
import { servers } from '@/lib/mockData'
import {
  useDanmakuConfigs,
  useReorderProviders,
  useSetProviderEnabled,
} from '@/lib/queries'
import '@/styles/page.css'
import './settings.css'

const PROVIDER_HINTS: Record<DanmakuProvider, string> = {
  dandanplay: 'dandanplay 综合弹幕库',
  bilibili: '需要登录以获取完整弹幕',
  tencent: '部分地区受限',
}

const SECTIONS = ['服务器', '播放', '弹幕', '关于'] as const
type Section = (typeof SECTIONS)[number]

export function Settings() {
  const [section, setSection] = useState<Section>('弹幕')
  const { danmaku, setDanmaku } = useUI()

  return (
    <div className="page settings-page">
      <div className="page-topbar">
        <div>
          <div className="page-eyebrow">偏好设置</div>
          <h1 className="page-title">设置</h1>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button
              key={s}
              className={`settings-nav-item${section === s ? ' is-active' : ''}`}
              onClick={() => setSection(s)}
            >
              {s}
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          {section === '服务器' && (
            <Group title="已连接的服务器" hint="管理 Emby 服务器与登录凭据">
              {servers.map((s) => (
                <div key={s.id} className="settings-server">
                  <span
                    className="settings-server-avatar"
                    style={{
                      background:
                        s.status === 'offline'
                          ? 'var(--surface-2)'
                          : `linear-gradient(135deg, ${s.accentFrom}, ${s.accentTo})`,
                    }}
                  >
                    {s.initial}
                  </span>
                  <div className="settings-server-meta">
                    <div className="settings-server-name">{s.name}</div>
                    <div className="settings-server-addr">{s.address}</div>
                  </div>
                  <Tag tone={s.status === 'offline' ? 'neutral' : 'success'} dot={s.status !== 'offline'}>
                    {s.status === 'offline' ? '离线' : '已连接'}
                  </Tag>
                </div>
              ))}
            </Group>
          )}

          {section === '播放' && (
            <>
              <Group title="播放引擎" hint="原生 mpv 提供最佳硬解与字幕渲染">
                <Row label="解码引擎" hint="libmpv 硬件解码 / HTML5 回退">
                  <Segmented
                    value="mpv"
                    options={[
                      { value: 'mpv', label: 'mpv' },
                      { value: 'html5', label: 'HTML5' },
                    ]}
                  />
                </Row>
                <Row label="启动时自动续播" hint="从上次离开处继续">
                  <Toggle checked onChange={() => {}} />
                </Row>
                <Row label="跳过片头" hint="检测到 OP 时显示跳过按钮">
                  <Toggle checked onChange={() => {}} />
                </Row>
              </Group>
            </>
          )}

          {section === '弹幕' && (
            <>
              <Group title="弹幕默认值" hint="新建播放会话的初始弹幕参数">
                <Row label="默认开启弹幕">
                  <Toggle checked={danmaku.enabled} onChange={(v) => setDanmaku({ enabled: v })} />
                </Row>
                <Row label="不透明度">
                  <div style={{ width: 200 }}>
                    <Slider
                      value={danmaku.opacity}
                      valueLabel={`${Math.round(danmaku.opacity * 100)}%`}
                      onChange={(v) => setDanmaku({ opacity: v })}
                    />
                  </div>
                </Row>
                <Row label="显示区域">
                  <Segmented
                    value={danmaku.area}
                    onChange={(v) => setDanmaku({ area: v })}
                    options={[
                      { value: 'top', label: '顶部' },
                      { value: 'half', label: '半屏' },
                      { value: 'full', label: '全屏' },
                    ]}
                  />
                </Row>
              </Group>
              <ProviderSources />
            </>
          )}

          {section === '关于' && (
            <Group title="关于 DanmakuEmby" hint="">
              <div className="about-block">
                <div className="about-logo">
                  <div className="onboard-logo-ring" />
                </div>
                <div className="about-name">DanmakuEmby</div>
                <div className="about-version">版本 0.1.0 · macOS</div>
                <p className="about-desc">
                  连接自建 Emby 服务器,浏览影视/番剧并在播放时叠加 B 站式弹幕。
                  无边框 macOS 窗口、毛玻璃材质、电光靛蓝强调色。
                </p>
              </div>
            </Group>
          )}
        </div>
      </div>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="settings-group">
      <div className="settings-group-head">
        <h3 className="settings-group-title">{title}</h3>
        {hint && <span className="settings-group-hint">{hint}</span>}
      </div>
      <div className="settings-group-body">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-meta">
        <span className="settings-row-icon">
          <Icon name="settings" size={15} color="var(--text-muted)" />
        </span>
        <div>
          <div className="settings-row-label">{label}</div>
          {hint && <div className="settings-row-hint">{hint}</div>}
        </div>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

/** Danmaku source list — persisted enable/priority backed by provider_configs. */
function ProviderSources() {
  const { data: configs = [] } = useDanmakuConfigs()
  const setEnabled = useSetProviderEnabled()
  const reorder = useReorderProviders()

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= configs.length) return
    const next = [...configs]
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next.map((c) => c.id))
  }

  return (
    <Group title="弹幕来源" hint="自动匹配的优先顺序,可开关与排序">
      {configs.map((config, index) => (
        <div key={config.id} className="settings-row">
          <div className="settings-row-meta">
            <span className="settings-row-icon settings-source-rank">{index + 1}</span>
            <div>
              <div className="settings-row-label">{config.name}</div>
              <div className="settings-row-hint">{PROVIDER_HINTS[config.manifestId]}</div>
            </div>
          </div>
          <div className="settings-row-control settings-source-actions">
            <button
              className="settings-source-move"
              onClick={() => move(index, -1)}
              disabled={index === 0 || reorder.isPending}
              aria-label="上移"
            >
              <Icon name="chevron-down" size={15} color="var(--text-muted)" style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button
              className="settings-source-move"
              onClick={() => move(index, 1)}
              disabled={index === configs.length - 1 || reorder.isPending}
              aria-label="下移"
            >
              <Icon name="chevron-down" size={15} color="var(--text-muted)" />
            </button>
            <Toggle
              checked={config.enabled}
              onChange={(v) => setEnabled.mutate({ id: config.id, enabled: v })}
              label={`${config.name} 开关`}
            />
          </div>
        </div>
      ))}
    </Group>
  )
}
