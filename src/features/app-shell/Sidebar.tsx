import { NavLink, useNavigate } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { TrafficLights } from '@/components/ui/primitives'
import { useUI } from '@/lib/store'
import { servers } from '@/lib/mockData'

const NAV = [
  { to: '/', icon: 'home', label: '首页', end: true },
  { to: '/library/movie', icon: 'film', label: '电影' },
  { to: '/library/series', icon: 'tv', label: '剧集' },
  { to: '/library/anime', icon: 'sparkle', label: '动漫' },
  { to: '/search', icon: 'search', label: '搜索' },
] as const

export function Sidebar() {
  const { currentServerId, sidebarCollapsed, toggleSidebar } = useUI()
  const navigate = useNavigate()
  const server = servers.find((s) => s.id === currentServerId) ?? servers[0]

  return (
    <aside className={`sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-top">
        <TrafficLights style={{ position: 'absolute', top: 18, left: 18 }} />
      </div>

      {/* Server switcher */}
      <button
        className="server-switch"
        onClick={() => navigate('/onboarding')}
        title={server.name}
      >
        <span
          className="server-avatar"
          style={{ background: `linear-gradient(135deg, ${server.accentFrom}, ${server.accentTo})` }}
        >
          {server.initial}
        </span>
        {!sidebarCollapsed && (
          <>
            <span className="server-meta">
              <span className="server-name">
                {server.name}
                <span className="status-dot status-online" />
              </span>
              <span className="server-sub">已连接 · {server.itemCount?.toLocaleString()} 部</span>
            </span>
            <Icon name="chevron-down" size={14} color="var(--text-tertiary)" />
          </>
        )}
      </button>

      {/* Primary nav */}
      <nav className="sidebar-nav" aria-label="主导航">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : false}
            className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
            title={sidebarCollapsed ? item.label : undefined}
          >
            <span className="nav-rail" />
            <Icon name={item.icon} size={sidebarCollapsed ? 19 : 18} />
            {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav" aria-label="次级">
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
          title={sidebarCollapsed ? '设置' : undefined}
        >
          <span className="nav-rail" />
          <Icon name="settings" size={sidebarCollapsed ? 19 : 18} />
          {!sidebarCollapsed && <span className="nav-label">设置</span>}
        </NavLink>
      </nav>

      {/* Footer: user + collapse */}
      <div className="sidebar-footer">
        <div className="user-chip">
          <span className="user-avatar" />
          {!sidebarCollapsed && (
            <span className="user-meta">
              <span className="user-name">cinephile</span>
              <span className="user-role">管理员</span>
            </span>
          )}
        </div>
        <button className="collapse-btn" onClick={toggleSidebar} title="折叠 / 展开侧栏">
          <Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} size={16} />
        </button>
      </div>
    </aside>
  )
}
