export type PlayerEngineMode = 'mpv-window' | 'libmpv-render'

export const DEFAULT_PLAYER_ENGINE_MODE: PlayerEngineMode = 'libmpv-render'

export function resolvePlayerEngineMode(raw?: string): PlayerEngineMode {
  switch (raw) {
    case 'libmpv-render':
    case 'l3':
    case 'single-window':
    case 'embedded':
      return 'libmpv-render'
    case 'mpv':
    case 'mpv-window':
      return 'mpv-window'
    default:
      return DEFAULT_PLAYER_ENGINE_MODE
  }
}
