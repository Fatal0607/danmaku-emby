import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TICKS_PER_SECOND, type PlaybackSource } from '@shared/types/emby'
import {
  MPV_CAPABILITIES,
  type PlayerCapabilities,
  type PlayerEngine,
  type PlayerEventName,
  type PlayerStateEvent,
} from './PlayerEngine'
import { MpvIpcClient, type MpvIpcOptions } from './mpv/MpvIpcClient'
import type { MpvEvent } from './mpv/protocol'

// Observed-property ids (docs 03 §3.4): mpv echoes these back on property-change.
const OBSERVE = { TIME: 1, DURATION: 2, PAUSE: 3, EOF: 4 } as const

export interface MpvVideoWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface MpvEngineOptions extends Omit<MpvIpcOptions, 'extraArgs'> {
  /** Current Electron overlay window bounds in screen pixels. */
  getVideoWindowBounds?: () => MpvVideoWindowBounds | undefined
  /** Native window/view id that mpv can render into via --wid. */
  getEmbedWindowId?: () => string | undefined
  extraArgs?: MpvIpcOptions['extraArgs']
}

/**
 * libmpv-backed engine via JSON IPC (docs 03 §3.4, L1: mpv child window + ASS
 * overlay). Control commands dispatch to mpv (`loadfile`, `set_property pause`,
 * `seek`), and observed `time-pos`/`pause`/`eof-reached` drive the danmaku
 * timeline and Emby progress reporting. macOS uses `--hwdec=videotoolbox`.
 */
export class MpvEngine implements PlayerEngine {
  private readonly client: MpvIpcClient
  private readonly listeners = new Map<PlayerEventName, Array<(p: PlayerStateEvent) => void>>()
  private connected = false
  private state: PlayerStateEvent = {
    timeSec: 0,
    durationSec: 0,
    paused: false,
    ended: false,
  }

  constructor(opts: MpvEngineOptions = {}) {
    // hwdec first so a caller-supplied --hwdec (e.g. headless tests) wins by
    // mpv's last-flag-wins rule.
    this.client = new MpvIpcClient({
      ...opts,
      extraArgs: () => [
        ...buildMpvWindowArgs({
          bounds: opts.getVideoWindowBounds?.(),
          embedWindowId: opts.getEmbedWindowId?.(),
        }),
        ...(typeof opts.extraArgs === 'function' ? opts.extraArgs() : (opts.extraArgs ?? [])),
      ],
    })
  }

  getCapabilities(): PlayerCapabilities {
    return MPV_CAPABILITIES
  }

  /** Launch mpv and subscribe to the properties that drive playback state. */
  async connect(): Promise<void> {
    if (this.connected) return
    await this.client.start()
    this.client.on('event', (e: MpvEvent) => this.onMpvEvent(e))
    this.client.on('exit', () => this.markEnded())
    await this.client.observeProperty(OBSERVE.TIME, 'time-pos')
    await this.client.observeProperty(OBSERVE.DURATION, 'duration')
    await this.client.observeProperty(OBSERVE.PAUSE, 'pause')
    await this.client.observeProperty(OBSERVE.EOF, 'eof-reached')
    this.connected = true
  }

  async load(src: PlaybackSource): Promise<void> {
    await this.connect()
    this.state = { timeSec: 0, durationSec: 0, paused: false, ended: false }
    await this.client.command(...buildLoadfileCommand(src))
  }

  play(): void {
    void this.client.setProperty('pause', false)
  }

  pause(): void {
    void this.client.setProperty('pause', true)
  }

  stop(): void {
    void this.client.command('stop')
  }

  seek(seconds: number): void {
    void this.client.command('seek', seconds, 'absolute')
  }

  setAudioTrack(index: number): void {
    void this.client.setProperty('aid', index)
  }

  setSubtitle(index: number | null): void {
    void this.client.setProperty('sid', index == null ? 'no' : index)
  }

  /** Write the danmaku ASS to a temp file and load it as a selected sub track. */
  async loadAssOverlay(assText: string): Promise<void> {
    const path = join(tmpdir(), `dmemby-danmaku-${Date.now()}.ass`)
    await writeFile(path, assText, 'utf8')
    await this.client.command('sub-add', path, 'select')
  }

  on(event: PlayerEventName, cb: (payload: PlayerStateEvent) => void): void {
    const arr = this.listeners.get(event) ?? []
    arr.push(cb)
    this.listeners.set(event, arr)
  }

  dispose(): void {
    this.listeners.clear()
    this.connected = false
    void this.client.stop()
  }

  private onMpvEvent(e: MpvEvent): void {
    if (e.event === 'property-change') {
      this.onPropertyChange(e)
    } else if (e.event === 'end-file') {
      this.markEnded()
    }
  }

  private onPropertyChange(e: MpvEvent): void {
    switch (e.name) {
      case 'time-pos':
        if (typeof e.data === 'number') {
          this.state = { ...this.state, timeSec: e.data }
          this.emit('timeupdate', this.state)
        }
        break
      case 'duration':
        if (typeof e.data === 'number') this.state = { ...this.state, durationSec: e.data }
        break
      case 'pause':
        if (typeof e.data === 'boolean') {
          this.state = { ...this.state, paused: e.data }
          this.emit(e.data ? 'pause' : 'play', this.state)
        }
        break
      case 'eof-reached':
        if (e.data === true) this.markEnded()
        break
    }
  }

  private markEnded(): void {
    if (this.state.ended) return
    this.state = { ...this.state, ended: true }
    this.emit('ended', this.state)
  }

  protected emit(event: PlayerEventName, payload: PlayerStateEvent): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload)
  }
}

export function buildLoadfileCommand(src: Pick<PlaybackSource, 'url' | 'startTicks'>): unknown[] {
  const startSec = src.startTicks ? src.startTicks / TICKS_PER_SECOND : 0
  if (startSec <= 0) return ['loadfile', src.url, 'replace']
  // mpv command syntax is: loadfile url [flags] [index] [options].
  // The playlist index must be present before the options map.
  return ['loadfile', src.url, 'replace', -1, { start: String(startSec) }]
}

export interface MpvWindowArgsOptions {
  bounds?: MpvVideoWindowBounds
  embedWindowId?: string
}

export function buildMpvWindowArgs(options: MpvWindowArgsOptions = {}): string[] {
  const args = [
    '--hwdec=videotoolbox',
    '--border=no',
    '--force-window=yes',
  ]
  if (options.embedWindowId) return [...args, '--vo=gpu', `--wid=${options.embedWindowId}`]

  const fallbackArgs = [...args, '--ontop']
  const bounds = options.bounds
  if (!bounds) return [...fallbackArgs, '--autofit-larger=1280x720', '--geometry=50%:50%']

  const width = Math.max(320, Math.round(bounds.width))
  const height = Math.max(180, Math.round(bounds.height))
  // macOS mpv's absolute +x+y geometry is less reliable across spaces/displays.
  // Size the L1/L2 video window to the Electron overlay and let mpv center it.
  return [...fallbackArgs, `--autofit-larger=${width}x${height}`, '--geometry=50%:50%']
}
