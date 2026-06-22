import { describe, expect, test } from 'vitest'
import { buildDeviceProfile } from '@/../electron/main/emby/DeviceProfileBuilder'
import { HTML5_CAPABILITIES, MPV_CAPABILITIES } from '@/../electron/main/player/PlayerEngine'

describe('buildDeviceProfile', () => {
  test('mpv profile declares permissive direct-play codecs for AC3/DTS/HEVC', () => {
    const profile = buildDeviceProfile(MPV_CAPABILITIES)
    const dp = profile.DirectPlayProfiles[0]
    // The whole point: AC3/DTS direct-play so mpv decodes locally with sound.
    expect(dp.AudioCodec).toContain('ac3')
    expect(dp.AudioCodec).toContain('dts')
    expect(dp.AudioCodec).toContain('truehd')
    expect(dp.VideoCodec).toContain('hevc')
    expect(dp.Container).toContain('mkv')
  })

  test('mpv profile keeps an hls/h264/aac transcode fallback', () => {
    const profile = buildDeviceProfile(MPV_CAPABILITIES)
    expect(profile.TranscodingProfiles).toHaveLength(1)
    const tc = profile.TranscodingProfiles[0]
    expect(tc.Protocol).toBe('hls')
    expect(tc.VideoCodec).toBe('h264')
    expect(tc.AudioCodec).toBe('aac')
  })

  test('html5 profile is conservative — forces server-side audio transcode', () => {
    const profile = buildDeviceProfile(HTML5_CAPABILITIES)
    const dp = profile.DirectPlayProfiles[0]
    expect(dp.AudioCodec).not.toContain('ac3')
    expect(dp.AudioCodec).not.toContain('dts')
    expect(dp.AudioCodec).toContain('aac')
  })

  test('honors an explicit max bitrate', () => {
    const profile = buildDeviceProfile(MPV_CAPABILITIES, 8_000_000)
    expect(profile.MaxStreamingBitrate).toBe(8_000_000)
    expect(profile.MaxStaticBitrate).toBe(8_000_000)
  })

  test('subtitle profiles prefer external ass/srt', () => {
    const profile = buildDeviceProfile(MPV_CAPABILITIES)
    const ass = profile.SubtitleProfiles.find((s) => s.Format === 'ass')
    expect(ass?.Method).toBe('External')
  })
})
