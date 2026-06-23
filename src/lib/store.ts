import { create } from 'zustand'

export interface DanmakuSettings {
  enabled: boolean
  opacity: number // 0..1
  fontScale: number // 0.5..1.5
  speed: number // 0.5..2
  area: 'top' | 'half' | 'full'
  density: number // 0..1, fraction of comments shown
}

interface UIState {
  currentServerId: string
  sidebarCollapsed: boolean
  danmaku: DanmakuSettings
  setServer: (id: string) => void
  toggleSidebar: () => void
  setDanmaku: (patch: Partial<DanmakuSettings>) => void
}

export const useUI = create<UIState>((set) => ({
  currentServerId: '',
  sidebarCollapsed: false,
  danmaku: {
    enabled: true,
    opacity: 0.82,
    fontScale: 1,
    speed: 1,
    area: 'half',
    density: 0.8,
  },
  setServer: (id) => set({ currentServerId: id }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setDanmaku: (patch) => set((s) => ({ danmaku: { ...s.danmaku, ...patch } })),
}))
