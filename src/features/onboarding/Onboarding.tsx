import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { Button, TrafficLights } from '@/components/ui/primitives'
import { useUI } from '@/lib/store'
import { servers } from '@/lib/mockData'
import './onboarding.css'

export function Onboarding() {
  const navigate = useNavigate()
  const { setServer } = useUI()
  const [address, setAddress] = useState('https://emby.local:8096')
  const [username, setUsername] = useState('cinephile')
  const [password, setPassword] = useState('cinephile')
  const [connecting, setConnecting] = useState(false)

  const connect = (id?: string) => {
    setConnecting(true)
    setTimeout(() => {
      if (id) setServer(id)
      navigate('/')
    }, 1400)
  }

  return (
    <div className="onboard">
      <div className="onboard-backdrop" aria-hidden="true" />
      <div className="onboard-blur" aria-hidden="true" />
      <div className="onboard-vignette" aria-hidden="true" />
      <TrafficLights style={{ position: 'absolute', top: 18, left: 18, zIndex: 50 }} />
      <div className="onboard-drag" />

      {/* Existing servers rail */}
      <aside className="onboard-servers">
        <div className="onboard-servers-label">我的服务器</div>
        <div className="onboard-server-list">
          {servers.map((s) => (
            <button
              key={s.id}
              className={`onboard-server${s.status === 'offline' ? ' is-offline' : ''}`}
              onClick={() => s.status !== 'offline' && connect(s.id)}
            >
              <span
                className="onboard-server-avatar"
                style={{
                  background:
                    s.status === 'offline'
                      ? 'var(--surface-2)'
                      : `linear-gradient(135deg, ${s.accentFrom}, ${s.accentTo})`,
                  color: s.status === 'offline' ? 'var(--text-tertiary)' : '#fff',
                }}
              >
                {s.initial}
              </span>
              <span className="onboard-server-meta">
                <span className="onboard-server-name">{s.name}</span>
                <span className="onboard-server-sub">
                  {s.status === 'offline' ? '离线' : s.address}
                </span>
              </span>
              <span
                className="status-dot"
                style={{
                  background: s.status === 'offline' ? 'var(--text-faint)' : 'var(--success)',
                  boxShadow: s.status === 'offline' ? 'none' : '0 0 8px var(--success)',
                }}
              />
            </button>
          ))}
          <button className="onboard-add">
            <Icon name="plus" size={16} color="var(--accent-bright)" /> 新增服务器
          </button>
        </div>
      </aside>

      {/* Connect card / connecting state */}
      <div className="onboard-stage">
        {connecting ? (
          <div className="onboard-card onboard-connecting">
            <div className="onboard-spinner" />
            <div className="onboard-connecting-title">正在连接 客厅影院…</div>
            <div className="onboard-connecting-sub">验证凭据 · 同步媒体库</div>
            <div className="onboard-connecting-bar">
              <div className="onboard-connecting-fill" />
            </div>
          </div>
        ) : (
          <div className="onboard-card">
            <div className="onboard-card-head">
              <div className="onboard-logo">
                <div className="onboard-logo-ring" />
              </div>
              <div className="onboard-card-title">连接到 Emby</div>
              <div className="onboard-card-sub">输入服务器地址与账户以开始</div>
            </div>
            <form
              className="onboard-form"
              onSubmit={(e) => {
                e.preventDefault()
                connect('living-room')
              }}
            >
              <Field label="服务器地址">
                <input
                  className="onboard-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="https://emby.local:8096"
                  autoFocus
                />
              </Field>
              <Field label="用户名">
                <input
                  className="onboard-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="密码">
                <input
                  className="onboard-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button full pulse style={{ marginTop: 6, padding: '12px 18px', fontSize: 14 }}>
                连接
              </Button>
              <div className="onboard-foot">
                <span>使用 HTTPS · 凭据本地加密保存</span>
                <span className="onboard-help">需要帮助?</span>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="onboard-field">
      <span className="onboard-field-label">{label}</span>
      {children}
    </label>
  )
}
