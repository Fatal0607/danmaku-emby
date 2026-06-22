import type { PlaybackSource } from '@shared/types/emby'

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

export type PlayerEventName = 'timeupdate' | 'ended' | 'pause' | 'play' | 'error'

export interface PlayerEngine {
  getCapabilities(): PlayerCapabilities
  load(src: PlaybackSource): Promise<void>
  play(): void
  pause(): void
  seek(seconds: number): void
  setAudioTrack(index: number): void
  setSubtitle(index: number | null): void
  /** mpv-only: load danmaku as an ASS overlay (html5 implements as no-op). */
  loadAssOverlay?(assText: string): void
  on(event: PlayerEventName, cb: (payload: PlayerStateEvent) => void): void
  dispose(): void
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
