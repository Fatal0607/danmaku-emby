import { describe, expect, test, vi } from 'vitest'
import { TICKS_PER_SECOND, type PlaybackSource, type ProgressReport } from '@shared/types/emby'
import type { PlayerStatePush } from '@shared/types/player'
import {
  PlayerController,
  type DanmakuOverlaySource,
  type PlaybackResolver,
} from '@/../electron/main/player/PlayerController'
import {
  MPV_CAPABILITIES,
  type PlayerEngine,
  type PlayerEventName,
  type PlayerStateEvent,
} from '@/../electron/main/player/PlayerEngine'
import type { DanmakuTrack } from '@shared/types/danmaku'

class FakeEngine implements PlayerEngine {
  loaded?: PlaybackSource
  ass?: string
  play = vi.fn()
  pause = vi.fn()
  stop = vi.fn()
  seek = vi.fn()
  setAudioTrack = vi.fn()
  setSubtitle = vi.fn()
  setVolume = vi.fn()
  setFrameSize = vi.fn()
  setVideoBounds = vi.fn()
  dispose = vi.fn()
  private readonly handlers = new Map<PlayerEventName, Array<(s: PlayerStateEvent) => void>>()

  getCapabilities() {
    return MPV_CAPABILITIES
  }
  getDiagnostics() {
    return {
      engine: 'mpv-window' as const,
      videoOutput: 'external-window' as const,
      backend: 'mpv',
      hardwareDecode: true,
      zeroCopy: true,
    }
  }
  async load(src: PlaybackSource) {
    this.loaded = src
  }
  async loadAssOverlay(ass: string) {
    this.ass = ass
  }
  on(event: PlayerEventName, cb: (s: PlayerStateEvent) => void) {
    const arr = this.handlers.get(event) ?? []
    arr.push(cb)
    this.handlers.set(event, arr)
  }
  fire(event: PlayerEventName, s: PlayerStateEvent) {
    for (const cb of this.handlers.get(event) ?? []) cb(s)
  }
}

const SRC: PlaybackSource = {
  itemId: 'i',
  mediaSourceId: 'ms',
  url: 'http://emby/stream',
  mode: 'directPlay',
  startTicks: 0,
  audioStreams: [],
  subtitleStreams: [],
  container: 'mkv',
  fileName: 'show.mkv',
  fileSize: 1000,
  runTimeTicks: 60 * TICKS_PER_SECOND,
}

const TRACK: DanmakuTrack = {
  provider: 'dandanplay',
  providerConfigId: 'default',
  indexedId: 'e',
  seasonId: 's',
  comments: [{ p: '1,1,16777215,h', m: 'hi' }],
  commentCount: 1,
  lastChecked: 0,
}

function fakeEmby(): PlaybackResolver & { reports: ProgressReport[] } {
  const reports: ProgressReport[] = []
  return {
    reports,
    resolvePlayback: vi.fn(async () => SRC),
    reportProgress: vi.fn(async (r: ProgressReport) => {
      reports.push(r)
    }),
  }
}

function fakeDanmaku(track: DanmakuTrack | null = TRACK): DanmakuOverlaySource {
  return {
    autoMatch: vi.fn(async () => track),
    toAss: vi.fn(() => 'ASS-DOC'),
  }
}

function harness(opts: { now?: () => number; progressIntervalMs?: number } = {}) {
  const engine = new FakeEngine()
  const emby = fakeEmby()
  const danmaku = fakeDanmaku()
  const pushes: PlayerStatePush[] = []
  const controller = new PlayerController(
    engine,
    emby,
    danmaku,
    { send: (s) => pushes.push(s) },
    { progressIntervalMs: opts.progressIntervalMs ?? 1000, now: opts.now ?? (() => 0) },
  )
  return { engine, emby, danmaku, pushes, controller }
}

describe('PlayerController', () => {
  test('load resolves source, loads engine, overlays danmaku, plays, reports start', async () => {
    const { engine, emby, danmaku, controller } = harness()
    const res = await controller.load({ serverId: 'srv', itemId: 'i' })

    expect(emby.resolvePlayback).toHaveBeenCalledWith('srv', 'i', undefined)
    expect(engine.loaded).toBe(SRC)
    expect(danmaku.autoMatch).toHaveBeenCalled()
    expect(engine.ass).toBe('ASS-DOC')
    expect(engine.play).toHaveBeenCalled()
    expect(res).toEqual({ durationSec: 60, danmakuCount: 1, playMethod: 'directPlay' })
    expect(emby.reports.at(-1)).toMatchObject({ event: 'start', itemId: 'i', mediaSourceId: 'ms' })
  })

  test('withDanmaku=false skips the overlay', async () => {
    const { engine, danmaku, controller } = harness()
    const res = await controller.load({ serverId: 'srv', itemId: 'i', withDanmaku: false })
    expect(danmaku.autoMatch).not.toHaveBeenCalled()
    expect(engine.ass).toBeUndefined()
    expect(res.danmakuCount).toBe(0)
  })

  test('danmaku overlay failure does not abort playback', async () => {
    const engine = new FakeEngine()
    const emby = fakeEmby()
    const danmaku: DanmakuOverlaySource = {
      autoMatch: vi.fn(async () => {
        throw new Error('bad provider response')
      }),
      toAss: vi.fn(() => 'ASS-DOC'),
    }
    const controller = new PlayerController(engine, emby, danmaku, { send: () => {} })
    const res = await controller.load({ serverId: 'srv', itemId: 'i' })

    expect(engine.loaded).toBe(SRC)
    expect(engine.play).toHaveBeenCalled()
    expect(res.danmakuCount).toBe(0)
  })

  test('time updates push state and throttle progress reports', async () => {
    let now = 0
    const { engine, emby, pushes, controller } = harness({ now: () => now, progressIntervalMs: 1000 })
    await controller.load({ serverId: 'srv', itemId: 'i' }) // start @ now=0

    now = 500
    engine.fire('timeupdate', { timeSec: 5, durationSec: 60, paused: false, ended: false })
    now = 800
    engine.fire('timeupdate', { timeSec: 8, durationSec: 60, paused: false, ended: false })
    // Under the interval: only the 'start' report so far.
    expect(emby.reports.filter((r) => r.event === 'progress')).toHaveLength(0)

    now = 1000
    engine.fire('timeupdate', { timeSec: 10, durationSec: 60, paused: false, ended: false })
    const progress = emby.reports.filter((r) => r.event === 'progress')
    expect(progress).toHaveLength(1)
    expect(progress[0].positionTicks).toBe(10 * TICKS_PER_SECOND)
    expect(pushes.at(-1)).toMatchObject({ timeSec: 10, durationSec: 60 })
  })

  test('pause toggle pushes paused state and reports progress', async () => {
    const { engine, emby, pushes, controller } = harness()
    await controller.load({ serverId: 'srv', itemId: 'i' })
    engine.fire('pause', { timeSec: 3, durationSec: 60, paused: true, ended: false })

    expect(pushes.at(-1)).toMatchObject({ paused: true })
    expect(emby.reports.at(-1)).toMatchObject({ event: 'progress', isPaused: true })
  })

  test('ended reports stop once, and dispose does not double-report', async () => {
    const { engine, emby, controller } = harness()
    await controller.load({ serverId: 'srv', itemId: 'i' })
    engine.fire('ended', { timeSec: 60, durationSec: 60, paused: false, ended: true })
    await controller.dispose()

    expect(emby.reports.filter((r) => r.event === 'stop')).toHaveLength(1)
    expect(engine.dispose).toHaveBeenCalled()
  })

  test('stop command halts playback and reports stop', async () => {
    const { engine, emby, pushes, controller } = harness()
    await controller.load({ serverId: 'srv', itemId: 'i' })
    engine.fire('timeupdate', { timeSec: 12, durationSec: 60, paused: false, ended: false })

    await controller.command({ type: 'stop' })

    expect(engine.stop).toHaveBeenCalled()
    expect(pushes.at(-1)).toMatchObject({ paused: true, ended: false })
    expect(emby.reports.filter((r) => r.event === 'stop')).toHaveLength(1)
    expect(emby.reports.at(-1)).toMatchObject({
      event: 'stop',
      positionTicks: 12 * TICKS_PER_SECOND,
    })
  })

  test('command dispatches to the engine', async () => {
    const { engine, controller } = harness()
    await controller.load({ serverId: 'srv', itemId: 'i' })
    controller.command({ type: 'seek', seconds: 42 })
    controller.command({ type: 'pause' })
    controller.command({ type: 'setSubtitle', index: null })
    controller.command({ type: 'setVolume', volume: 0.42 })
    controller.command({ type: 'setFrameSize', width: 1440, height: 900 })
    controller.command({ type: 'setVideoBounds', x: 20, y: 30, width: 1280, height: 720 })
    expect(engine.seek).toHaveBeenCalledWith(42)
    expect(engine.pause).toHaveBeenCalled()
    expect(engine.setSubtitle).toHaveBeenCalledWith(null)
    expect(engine.setVolume).toHaveBeenCalledWith(0.42)
    expect(engine.setFrameSize).toHaveBeenCalledWith(1440, 900)
    expect(engine.setVideoBounds).toHaveBeenCalledWith({ x: 20, y: 30, width: 1280, height: 720 })
  })

  test('a failing progress report never breaks load', async () => {
    const engine = new FakeEngine()
    const emby: PlaybackResolver = {
      resolvePlayback: vi.fn(async () => SRC),
      reportProgress: vi.fn(async () => {
        throw new Error('network down')
      }),
    }
    const controller = new PlayerController(engine, emby, fakeDanmaku(), { send: () => {} })
    await expect(controller.load({ serverId: 'srv', itemId: 'i' })).resolves.toMatchObject({
      danmakuCount: 1,
    })
  })

  test('diagnostics expose the active engine output mode', () => {
    const { controller } = harness()

    expect(controller.getDiagnostics()).toMatchObject({
      engine: 'mpv-window',
      videoOutput: 'external-window',
      backend: 'mpv',
    })
  })
})
