import type {
  PlayerCommand,
  PlayerDiagnostics,
  PlayerLoadRequest,
  PlayerLoadResult,
  PlayerStatePush,
  PlayerVideoFramePush,
} from '@shared/types/player'
import { getApi, isElectron, unwrap } from './ipc'

// Renderer-side player access. Electron delegates to Main's PlayerController;
// browser preview keeps using the local mock playhead in Player.tsx.

export interface PlayerSource {
  readonly kind: 'electron' | 'mock'
  load(req: PlayerLoadRequest): Promise<PlayerLoadResult>
  command(cmd: PlayerCommand): Promise<void>
  diagnostics(): Promise<PlayerDiagnostics>
  onState(cb: (state: PlayerStatePush) => void): () => void
  onFrame(cb: (frame: PlayerVideoFramePush) => void): () => void
}

class ElectronPlayerSource implements PlayerSource {
  readonly kind = 'electron' as const

  load(req: PlayerLoadRequest): Promise<PlayerLoadResult> {
    return unwrap(getApi().player.load(req))
  }

  command(cmd: PlayerCommand): Promise<void> {
    return unwrap(getApi().player.command(cmd))
  }

  diagnostics(): Promise<PlayerDiagnostics> {
    return unwrap(getApi().player.diagnostics())
  }

  onState(cb: (state: PlayerStatePush) => void): () => void {
    return getApi().player.onState(cb)
  }

  onFrame(cb: (frame: PlayerVideoFramePush) => void): () => void {
    return getApi().player.onFrame(cb)
  }
}

class MockPlayerSource implements PlayerSource {
  readonly kind = 'mock' as const

  async load(): Promise<PlayerLoadResult> {
    return { durationSec: 0, danmakuCount: 0, playMethod: 'directPlay' }
  }

  async command(): Promise<void> {
    /* Local preview controls are handled by Player.tsx state. */
  }

  async diagnostics(): Promise<PlayerDiagnostics> {
    return {
      engine: 'mpv-window',
      videoOutput: 'external-window',
      backend: 'mock',
      hardwareDecode: false,
      zeroCopy: false,
    }
  }

  onState(): () => void {
    return () => {}
  }

  onFrame(): () => void {
    return () => {}
  }
}

let cached: PlayerSource | null = null

export function getPlayerSource(): PlayerSource {
  if (!cached) cached = isElectron() ? new ElectronPlayerSource() : new MockPlayerSource()
  return cached
}
