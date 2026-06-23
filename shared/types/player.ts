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

export type PlayerCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; seconds: number }
  | { type: 'setAudioTrack'; index: number }
  | { type: 'setSubtitle'; index: number | null }

export interface PlayerStatePush {
  timeSec: number
  durationSec: number
  paused: boolean
  ended: boolean
  error?: string
}
