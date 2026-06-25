import type { PlaybackMode } from './emby'

// Player control contract shared between Main (PlayerController) and Renderer
// (docs 03 §3.3). PLAYER_LOAD/PLAYER_CMD are invoke channels; PLAYER_STATE is a
// push (webContents.send) driven by mpv's observed properties.

export interface PlayerLoadRequest {
  serverId: string
  itemId: string
  startTicks?: number
  /** Auto-match and overlay danmaku for this item (default true). */
  withDanmaku?: boolean
}

export interface PlayerLoadResult {
  durationSec: number
  danmakuCount: number
  playMethod: PlaybackMode
}

export interface PlayerVideoBounds {
  x: number
  y: number
  width: number
  height: number
}

export type PlayerEngineId = 'mpv-window' | 'libmpv-render'

export type PlayerVideoOutputMode = 'external-window' | 'software-frame' | 'shared-texture'

export interface PlayerDiagnostics {
  engine: PlayerEngineId
  videoOutput: PlayerVideoOutputMode
  backend: string
  hardwareDecode: boolean
  zeroCopy: boolean
  geometry?: string
  frameSize?: {
    width: number
    height: number
  }
  note?: string
}

export type PlayerCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'seek'; seconds: number }
  | { type: 'setAudioTrack'; index: number }
  | { type: 'setSubtitle'; index: number | null }
  | { type: 'setVolume'; volume: number }
  | { type: 'setFrameSize'; width: number; height: number }
  | ({ type: 'setVideoBounds' } & PlayerVideoBounds)

export interface PlayerStatePush {
  timeSec: number
  durationSec: number
  paused: boolean
  ended: boolean
  error?: string
}

export interface PlayerVideoFramePush {
  width: number
  height: number
  format: 'rgba'
  data: Uint8Array
}
