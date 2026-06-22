import type { PlayerCapabilities } from '../player/PlayerEngine'

// Builds the Emby DeviceProfile from the active engine's capabilities
// (docs 02 §2.4). This is the master switch for the no-audio problem: a
// permissive profile makes Emby return the original file (DirectPlay) so mpv
// decodes AC3/DTS/HEVC locally; a conservative profile forces compat transcode.

export interface DirectPlayProfile {
  Container: string
  Type: 'Video' | 'Audio'
  VideoCodec?: string
  AudioCodec?: string
}

export interface TranscodingProfile {
  Container: string
  Type: 'Video'
  Protocol: string
  VideoCodec: string
  AudioCodec: string
  Context: 'Streaming'
}

export interface SubtitleProfile {
  Format: string
  Method: 'External' | 'Embed' | 'Encode'
}

export interface DeviceProfile {
  MaxStaticBitrate: number
  MaxStreamingBitrate: number
  DirectPlayProfiles: DirectPlayProfile[]
  TranscodingProfiles: TranscodingProfile[]
  SubtitleProfiles: SubtitleProfile[]
}

const MAX_BITRATE = 1_000_000_000

/** HLS/H.264/AAC fallback used when direct play is impossible. */
const FALLBACK_TRANSCODE: TranscodingProfile = {
  Container: 'ts',
  Type: 'Video',
  Protocol: 'hls',
  VideoCodec: 'h264',
  AudioCodec: 'aac',
  Context: 'Streaming',
}

const SUBTITLE_PROFILES: SubtitleProfile[] = [
  { Format: 'ass', Method: 'External' },
  { Format: 'srt', Method: 'External' },
  { Format: 'pgssub', Method: 'Embed' },
]

export function buildDeviceProfile(
  caps: PlayerCapabilities,
  maxBitrate: number = MAX_BITRATE,
): DeviceProfile {
  return {
    MaxStaticBitrate: maxBitrate,
    MaxStreamingBitrate: maxBitrate,
    DirectPlayProfiles: [
      {
        Container: caps.containers.join(','),
        Type: 'Video',
        VideoCodec: caps.videoCodecs.join(','),
        AudioCodec: caps.audioCodecs.join(','),
      },
    ],
    TranscodingProfiles: [FALLBACK_TRANSCODE],
    SubtitleProfiles: SUBTITLE_PROFILES,
  }
}
