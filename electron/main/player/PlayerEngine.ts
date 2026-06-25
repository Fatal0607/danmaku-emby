import type { PlaybackSource } from '@shared/types/emby'
import type { PlayerDiagnostics, PlayerVideoBounds } from '@shared/types/player'

// Player engine abstraction (docs 03 §3.3). MVP ships MpvEngine; Html5Engine is
// a downgrade path. Business code and UI never depend on the concrete engine.

export interface PlayerCapabilities {
  videoCodecs: string[]
  audioCodecs: string[]
  containers: string[]
  subtitleFormats: string[]
  hardwareDecode: boolean
}

export interface PlayerStateEvent {
  timeSec: number
  durationSec: number
  paused: boolean
  ended: boolean
  error?: string
}

export interface PlayerVideoFrameEvent {
  width: number
  height: number
  format: 'rgba'
  data: Uint8Array
}

export type PlayerEventName = 'timeupdate' | 'ended' | 'pause' | 'play' | 'error'

export interface PlayerEngine {
  getCapabilities(): PlayerCapabilities
  getDiagnostics(): PlayerDiagnostics
  load(src: PlaybackSource): Promise<void>
  play(): void
  pause(): void
  stop?(): void
  seek(seconds: number): void
  setAudioTrack(index: number): void
  setSubtitle(index: number | null): void
  setVolume?(volume: number): void
  setFrameSize?(width: number, height: number): void
  setVideoBounds?(bounds: PlayerVideoBounds): void
  /** mpv-only: load danmaku as an ASS overlay (html5 implements as no-op). */
  loadAssOverlay?(assText: string): void
  on(event: PlayerEventName, cb: (payload: PlayerStateEvent) => void): void
  dispose(): void
}

export interface PlayerFrameEngine extends PlayerEngine {
  onFrame(cb: (frame: PlayerVideoFrameEvent) => void): void
}

export function hasVideoFrames(engine: PlayerEngine): engine is PlayerFrameEngine {
  return typeof (engine as Partial<PlayerFrameEngine>).onFrame === 'function'
}

/** MpvEngine capability declaration (docs 03 §3.6) — feeds DeviceProfileBuilder. */
export const MPV_CAPABILITIES: PlayerCapabilities = {
  videoCodecs: ['h264', 'hevc', 'vp9', 'av1', 'mpeg2video', 'mpeg4', 'vc1'],
  audioCodecs: [
    'aac',
    'ac3',
    'eac3',
    'dts',
    'dts-hd',
    'truehd',
    'flac',
    'mp3',
    'opus',
    'pcm',
    'vorbis',
  ],
  containers: ['mkv', 'mp4', 'avi', 'ts', 'm2ts', 'flv', 'webm', 'mov', 'wmv'],
  subtitleFormats: ['ass', 'srt', 'pgssub', 'dvdsub'],
  hardwareDecode: true,
}

/** Html5Engine conservative capabilities (docs 03 §3.3) — forces server compat transcode. */
export const HTML5_CAPABILITIES: PlayerCapabilities = {
  videoCodecs: ['h264', 'vp9'],
  audioCodecs: ['aac', 'mp3', 'opus'],
  containers: ['mp4', 'webm'],
  subtitleFormats: ['srt', 'vtt'],
  hardwareDecode: false,
}
