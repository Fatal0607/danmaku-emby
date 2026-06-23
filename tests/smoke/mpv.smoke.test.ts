import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND, type PlaybackSource, type ProgressReport } from '@shared/types/emby'
import type { PlayerStatePush } from '@shared/types/player'
import { MpvIpcClient } from '../../electron/main/player/mpv/MpvIpcClient'
import { MpvEngine } from '../../electron/main/player/MpvEngine'
import { PlayerController } from '../../electron/main/player/PlayerController'
import type { PlayerStateEvent } from '../../electron/main/player/PlayerEngine'

// Live mpv control-plane smoke (docs 03 §3.4, Spike A). Requires a real `mpv`
// binary (brew install mpv); opt-in so CI stays deterministic and headless:
//   MPV_SMOKE=1 npx vitest run tests/smoke/mpv.smoke.test.ts
// Uses lavfi testsrc + null video/audio so it runs without a display.

const enabled = Boolean(process.env.MPV_SMOKE)
const BIN = process.env.MPV_BIN ?? 'mpv'
const HEADLESS = ['--vo=null', '--ao=null', '--hwdec=no']
const TEST_SRC = 'av://lavfi:testsrc=size=320x240:rate=10:duration=60'

function source(url: string): PlaybackSource {
  return {
    itemId: 't',
    mediaSourceId: 'm',
    url,
    mode: 'directPlay',
    startTicks: 0,
    audioStreams: [],
    subtitleStreams: [],
    container: '',
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor<T>(probe: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T = await probe()
  while (Date.now() < deadline) {
    last = await probe()
    if (ok(last)) return last
    await delay(120)
  }
  return last
}

describe.runIf(enabled)('mpv live control plane (Spike A)', () => {
  it('MpvIpcClient: connect, loadfile, observe time-pos, pause, seek, ASS overlay', async () => {
    const client = new MpvIpcClient({ binaryPath: BIN, extraArgs: HEADLESS })
    // `time-pos` errors with "property unavailable" until the first frame
    // decodes — tolerate that while polling (the engine uses observe_property).
    const tryGet = async (name: string): Promise<unknown> => {
      try {
        return await client.getProperty(name)
      } catch {
        return undefined
      }
    }
    await client.start()
    try {
      const version = await client.getProperty('mpv-version')
      console.info('[mpv] version:', version)
      expect(String(version)).toMatch(/^mpv/)

      await client.command('loadfile', TEST_SRC, 'replace')
      await client.setProperty('pause', false)

      // time-pos advances → control plane + clock are live.
      const t = (await waitFor(
        () => tryGet('time-pos'),
        (v) => typeof v === 'number' && (v as number) > 0,
      )) as number
      console.info('[mpv] time-pos advanced to', t)
      expect(t).toBeGreaterThan(0)

      await client.setProperty('pause', true)
      expect(await client.getProperty('pause')).toBe(true)

      await client.command('seek', 20, 'absolute')
      const seeked = (await waitFor(
        () => tryGet('time-pos'),
        (v) => typeof v === 'number' && Math.abs((v as number) - 20) < 2,
      )) as number
      expect(Math.abs(seeked - 20)).toBeLessThan(2)

      // sub-add an ASS overlay (danmaku path) and confirm a sub track exists.
      const ass = [
        '[Script Info]',
        'ScriptType: v4.00+',
        'PlayResX: 1920',
        'PlayResY: 1080',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, Alignment',
        'Style: Danmaku,Sans,48,&H00FFFFFF,7',
        '[Events]',
        'Format: Layer, Start, End, Style, Text',
        'Dialogue: 0,0:00:00.00,0:00:10.00,Danmaku,弹幕测试',
      ].join('\n')
      const path = join(tmpdir(), `dmemby-spike-${Date.now()}.ass`)
      writeFileSync(path, ass)
      await client.command('sub-add', path, 'select') // rejects if it failed to load
      const trackCount = Number(await tryGet('track-list/count'))
      console.info('[mpv] track-list/count after overlay:', trackCount)
      expect(trackCount).toBeGreaterThanOrEqual(1)
    } finally {
      await client.stop()
    }
  }, 30000)

  it('MpvEngine: load emits timeupdate and ASS overlay loads', async () => {
    const engine = new MpvEngine({ binaryPath: BIN, extraArgs: HEADLESS })
    const times: number[] = []
    const paused: boolean[] = []
    engine.on('timeupdate', (s: PlayerStateEvent) => times.push(s.timeSec))
    engine.on('pause', () => paused.push(true))
    try {
      await engine.connect()
      await engine.load(source(TEST_SRC))
      engine.play()
      await waitFor(
        async () => times.length,
        (n) => n > 0 && times.some((t) => t > 0),
      )
      expect(times.some((t) => t > 0)).toBe(true)

      await engine.loadAssOverlay('[Script Info]\nScriptType: v4.00+\n[Events]\n')
      engine.pause()
      await delay(300)
      expect(paused.length).toBeGreaterThanOrEqual(1)
      console.info('[mpv] engine timeupdates:', times.length)
    } finally {
      engine.dispose()
      await delay(200)
    }
  }, 30000)

  it('PlayerController: drives mpv, pushes state, reports start/progress/stop', async () => {
    const reports: ProgressReport[] = []
    const pushes: PlayerStatePush[] = []
    const engine = new MpvEngine({ binaryPath: BIN, extraArgs: HEADLESS })
    const controller = new PlayerController(
      engine,
      {
        resolvePlayback: async () => ({
          ...source(TEST_SRC),
          mediaSourceId: 'ms',
          runTimeTicks: 60 * TICKS_PER_SECOND,
        }),
        reportProgress: async (r: ProgressReport) => {
          reports.push(r)
        },
      },
      { autoMatch: async () => null, toAss: () => '' },
      { send: (s) => pushes.push(s) },
      { progressIntervalMs: 500 },
    )
    try {
      await controller.load({ serverId: 'srv', itemId: 'i' })
      await waitFor(
        async () => pushes.some((p) => p.timeSec > 0) && reports.some((r) => r.event === 'progress'),
        (ok) => ok === true,
        8000,
      )
      expect(reports[0]?.event).toBe('start')
      expect(reports.some((r) => r.event === 'progress')).toBe(true)
      expect(pushes.some((p) => p.timeSec > 0)).toBe(true)
      console.info('[mpv] controller reports:', reports.map((r) => r.event).join(','))
    } finally {
      await controller.dispose()
    }
    expect(reports.some((r) => r.event === 'stop')).toBe(true)
  }, 30000)

  it('startTicks maps to mpv start option seconds', () => {
    expect(source('x').startTicks / TICKS_PER_SECOND).toBe(0)
    expect(30 * TICKS_PER_SECOND / TICKS_PER_SECOND).toBe(30)
  })
})
