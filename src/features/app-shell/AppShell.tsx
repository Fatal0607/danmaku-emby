import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import './app-shell.css'

export function AppShell() {
  return (
    <div className="app-shell">
      {/* Ambient backdrop — soft indigo/violet blooms behind frosted glass */}
      <div className="app-backdrop" aria-hidden="true" />
      <div className="app-backdrop-blur" aria-hidden="true" />

      <Sidebar />

      {/* Draggable titlebar strip (frameless window) */}
      <div className="app-titlebar" />

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}
