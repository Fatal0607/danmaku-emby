import { useState } from 'react'
import type { DanmakuProvider, DanmakuTestResult, ProviderConfig } from '@shared/types/danmaku'
import { Icon } from '@/components/ui/Icon'
import { Button, Toggle, Segmented, Slider, Tag } from '@/components/ui/primitives'
import { useUI } from '@/lib/store'
import { servers } from '@/lib/mockData'
import {
  useDanmakuConfigs,
  useReorderProviders,
  useSetProviderConfig,
  useSetProviderEnabled,
  useTestProvider,
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

/** Danmaku source list — persisted enable/priority/config backed by provider_configs. */
function ProviderSources() {
  const { data: configs = [] } = useDanmakuConfigs()
  const setEnabled = useSetProviderEnabled()
  const reorder = useReorderProviders()
  const [expanded, setExpanded] = useState<string | null>(null)

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= configs.length) return
    const next = [...configs]
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next.map((c) => c.id))
  }

  return (
    <Group title="弹幕来源" hint="自动匹配的优先顺序,可开关、排序与配置">
      {configs.map((config, index) => {
        const open = expanded === config.id
        return (
          <div key={config.id} className="settings-source">
            <div className="settings-row">
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
                <button
                  className={`settings-source-move${open ? ' is-active' : ''}`}
                  onClick={() => setExpanded(open ? null : config.id)}
                  aria-label="配置"
                  aria-expanded={open}
                >
                  <Icon name="settings" size={15} color="var(--text-muted)" />
                </button>
                <Toggle
                  checked={config.enabled}
                  onChange={(v) => setEnabled.mutate({ id: config.id, enabled: v })}
                  label={`${config.name} 开关`}
                />
              </div>
            </div>
            {open && <ProviderConfigDrawer config={config} />}
          </div>
        )
      })}
    </Group>
  )
}

/** Per-provider configuration + connectivity test. */
function ProviderConfigDrawer({ config }: { config: ProviderConfig }) {
  const test = useTestProvider()
  return (
    <div className="settings-source-drawer">
      {config.manifestId === 'dandanplay' ? (
        <DandanplayFields config={config} />
      ) : (
        <p className="settings-drawer-note">
          {config.manifestId === 'bilibili'
            ? 'B 站弹幕需要登录获取 Cookie,登录窗口将在后续版本接入。'
            : '腾讯视频依赖站点 Cookie,部分内容受地区/会员限制。'}
        </p>
      )}
      <div className="settings-drawer-actions">
        <Button
          variant="secondary"
          onClick={() => test.mutate(config.id)}
          disabled={test.isPending}
        >
          {test.isPending ? '测试中…' : '测试连接'}
        </Button>
        <TestResultBadge result={test.data} error={test.error} />
      </div>
    </div>
  )
}

function TestResultBadge({ result, error }: { result?: DanmakuTestResult; error: unknown }) {
  if (error) {
    const message = error instanceof Error ? error.message : String(error)
    return <span className="settings-test-result is-fail">✕ {message}</span>
  }
  if (!result) return null
  return (
    <span className={`settings-test-result ${result.ok ? 'is-ok' : 'is-fail'}`}>
      {result.ok ? '✓ ' : '✕ '}
      {result.message}
    </span>
  )
}

/** dandanplay needs a signing proxy (baseUrl) or AppId/AppSecret credentials. */
function DandanplayFields({ config }: { config: ProviderConfig }) {
  const save = useSetProviderConfig()
  const cv = config.configValues
  const [baseUrl, setBaseUrl] = useState(typeof cv.baseUrl === 'string' ? cv.baseUrl : '')
  const [appId, setAppId] = useState(typeof cv.appId === 'string' ? cv.appId : '')
  const [appSecret, setAppSecret] = useState(typeof cv.appSecret === 'string' ? cv.appSecret : '')
  const [chConvert, setChConvert] = useState<'0' | '1' | '2'>(
    (['0', '1', '2'] as const).includes(String(cv.chConvert) as '0' | '1' | '2')
      ? (String(cv.chConvert) as '0' | '1' | '2')
      : '0',
  )

  const onSave = () => {
    save.mutate({
      id: config.id,
      configValues: {
        baseUrl: baseUrl.trim(),
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        chConvert: Number(chConvert),
      },
    })
  }

  return (
    <div className="settings-fields">
      <p className="settings-drawer-note">
        官方 API 对所有接口要求 AppId 签名。请填写自有 AppId / AppSecret,或填入已代签的代理地址,二选一即可。
      </p>
      <Field label="代理地址" hint="留空则直连官方 https://api.dandanplay.net">
        <input
          className="settings-input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://your-proxy.example.com/ddp"
          spellCheck={false}
        />
      </Field>
      <Field label="AppId">
        <input
          className="settings-input"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="官方申请的 AppId"
          spellCheck={false}
        />
      </Field>
      <Field label="AppSecret" hint="仅保存在本机,代理代签时可留空">
        <input
          className="settings-input"
          type="password"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          placeholder="••••••••"
          spellCheck={false}
        />
      </Field>
      <Field label="简繁转换">
        <Segmented
          value={chConvert}
          onChange={setChConvert}
          options={[
            { value: '0', label: '不转换' },
            { value: '1', label: '简体' },
            { value: '2', label: '繁体' },
          ]}
        />
      </Field>
      <div className="settings-drawer-actions">
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? '保存中…' : '保存配置'}
        </Button>
        {save.isSuccess && <span className="settings-test-result is-ok">✓ 已保存并生效</span>}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="settings-field">
      <div className="settings-field-meta">
        <span className="settings-field-label">{label}</span>
        {hint && <span className="settings-field-hint">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
