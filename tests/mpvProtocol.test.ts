import { describe, expect, test } from 'vitest'
import {
  consumeMessages,
  encodeCommand,
  isEvent,
  parseLine,
} from '@/../electron/main/player/mpv/protocol'
import { TICKS_PER_SECOND } from '@shared/types/emby'
import {
  buildLoadfileCommand,
  buildMpvWindowArgs,
  toMpvVolumePercent,
} from '@/../electron/main/player/MpvEngine'

describe('mpv protocol codec', () => {
  test('encodeCommand emits a newline-terminated request', () => {
    expect(encodeCommand(['loadfile', 'x.mkv'], 7)).toBe(
      '{"command":["loadfile","x.mkv"],"request_id":7}\n',
    )
  })

  test('parseLine returns null for malformed JSON', () => {
    expect(parseLine('{not json')).toBeNull()
    expect(parseLine('42')).toBeNull() // not an object
  })

  test('consumeMessages splits multiple lines and keeps the remainder', () => {
    const { messages, rest } = consumeMessages(
      '{"request_id":1,"error":"success","data":3}\n{"event":"pause"}\n{"partial":',
    )
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ request_id: 1, data: 3 })
    expect(messages[1]).toMatchObject({ event: 'pause' })
    expect(rest).toBe('{"partial":')
  })

  test('consumeMessages reassembles a line split across chunks', () => {
    const first = consumeMessages('{"event":"property-change","name":"time-pos"')
    expect(first.messages).toHaveLength(0)
    const second = consumeMessages(`${first.rest},"data":12.5}\n`)
    expect(second.messages[0]).toMatchObject({ name: 'time-pos', data: 12.5 })
    expect(second.rest).toBe('')
  })

  test('isEvent distinguishes notifications from command replies', () => {
    expect(isEvent({ event: 'end-file' })).toBe(true)
    expect(isEvent({ request_id: 1, error: 'success' })).toBe(false)
  })

  test('buildLoadfileCommand includes playlist index before start options', () => {
    expect(
      buildLoadfileCommand({
        url: 'https://emby/video.mkv',
        startTicks: 266 * TICKS_PER_SECOND,
      }),
    ).toEqual(['loadfile', 'https://emby/video.mkv', 'replace', -1, { start: '266' }])
  })

  test('buildMpvWindowArgs aligns the mpv window to the Electron overlay', () => {
    const args = buildMpvWindowArgs({
      bounds: { x: 12.4, y: 34.6, width: 1440.2, height: 900.3 },
    })
    expect(args).toContain('--geometry=1440x900+12+35')
    expect(args).toContain('--ontop')
  })

  test('buildMpvWindowArgs embeds into a native window when an id is available', () => {
    const args = buildMpvWindowArgs({
      bounds: { x: 12.4, y: 34.6, width: 1440.2, height: 900.3 },
      embedWindowId: '123456',
    })
    expect(args).toContain('--wid=123456')
    expect(args).not.toContain('--ontop')
    expect(args.some((arg) => arg.startsWith('--autofit-larger='))).toBe(false)
    expect(args.some((arg) => arg.startsWith('--geometry='))).toBe(false)
  })

  test('toMpvVolumePercent maps renderer volume to mpv percentage', () => {
    expect(toMpvVolumePercent(0)).toBe(0)
    expect(toMpvVolumePercent(0.42)).toBe(42)
    expect(toMpvVolumePercent(1)).toBe(100)
    expect(toMpvVolumePercent(-0.1)).toBe(0)
    expect(toMpvVolumePercent(1.2)).toBe(100)
    expect(toMpvVolumePercent(Number.NaN)).toBe(100)
  })
})
