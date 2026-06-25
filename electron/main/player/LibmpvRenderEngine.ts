import { createRequire } from 'node:module'
import { TICKS_PER_SECOND, type PlaybackSource } from '@shared/types/emby'
import type { PlayerDiagnostics } from '@shared/types/player'
import {
  MPV_CAPABILITIES,
  type PlayerCapabilities,
  type PlayerEngine,
  type PlayerEventName,
  type PlayerStateEvent,
  type PlayerVideoFrameEvent,
} from './PlayerEngine'
import {
  normalizeSoftwareFrameSize,
  resolveLibmpvRenderTuning,
  type LibmpvRenderTuning,
} from './libmpvRenderTuning'
import {
  resolveLibmpvRenderBackend,
  type LibmpvNativeBackendReport,
  type ResolvedLibmpvRenderBackend,
} from './libmpvRenderBackend'

interface NativePlayerState {
  timeSec: number
  durationSec: number
  paused: boolean
  ended: boolean
}

interface NativeRenderedFrame {
  width: number
  height: number
  format: 'rgba'
  updated: boolean
  data: Uint8Array
}

interface NativePlayer {
  load(url: string, startSec?: number): void
  setPause(paused: boolean): void
  seek(seconds: number): void
  setAudioTrack(index: number): void
  setSubtitle(index: number | null): void
  setVolume(volume: number): void
  addSubtitle(path: string): void
  renderFrame(width: number, height: number): NativeRenderedFrame
  getState(): NativePlayerState
  dispose(): void
}

interface NativeModule {
  Player: new () => NativePlayer
  getRenderBackendReport(): LibmpvNativeBackendReport
}

export interface LibmpvRenderEngineOptions {
  width?: number
  height?: number
  targetFps?: number
  maxPixels?: number
  frameIntervalMs?: number
  stateIntervalMs?: number
}

const require = createRequire(import.meta.url)
let nativeModule: NativeModule | null = null

/**
 * L3 prototype: libmpv render API → software RGBA frames → Electron canvas.
 *
 * This avoids mpv's native window entirely. The first cut deliberately uses
 * MPV_RENDER_API_TYPE_SW to prove the ownership/data-flow shape before moving
 * to OpenGL/Metal shared textures for production performance.
 */
export class LibmpvRenderEngine implements PlayerEngine {
  private readonly listeners = new Map<PlayerEventName, Array<(p: PlayerStateEvent) => void>>()
  private readonly frameListeners: Array<(f: PlayerVideoFrameEvent) => void> = []
  private width: number
  private height: number
  private readonly tuning: LibmpvRenderTuning
  private readonly frameIntervalMs: number
  private readonly stateIntervalMs: number
  private backend: ResolvedLibmpvRenderBackend | undefined
  private player: NativePlayer | null = null
  private volume = 1
  private frameTimer: NodeJS.Timeout | undefined
  private stateTimer: NodeJS.Timeout | undefined
  private loaded = false
  private rendering = false
  private state: PlayerStateEvent = {
    timeSec: 0,
    durationSec: 0,
    paused: false,
    ended: false,
  }

  constructor(opts: LibmpvRenderEngineOptions = {}) {
    this.tuning = resolveLibmpvRenderTuning({
      DMEMBY_L3_TARGET_FPS: process.env.DMEMBY_L3_TARGET_FPS,
      DMEMBY_L3_MAX_PIXELS: process.env.DMEMBY_L3_MAX_PIXELS,
      targetFps: opts.targetFps,
      maxPixels: opts.maxPixels,
    })
    const initialSize = normalizeSoftwareFrameSize(opts.width ?? 1280, opts.height ?? 720, this.tuning)
    this.width = initialSize.width
    this.height = initialSize.height
    this.frameIntervalMs = opts.frameIntervalMs ?? this.tuning.frameIntervalMs
    this.stateIntervalMs = opts.stateIntervalMs ?? 250
  }

  getCapabilities(): PlayerCapabilities {
    return { ...MPV_CAPABILITIES, hardwareDecode: false }
  }

  getDiagnostics(): PlayerDiagnostics {
    return {
      engine: 'libmpv-render',
      videoOutput: 'software-frame',
      backend: this.backend?.id ?? 'software',
      hardwareDecode: false,
      zeroCopy: false,
      frameSize: {
        width: this.width,
        height: this.height,
      },
      note: 'libmpv renders RGBA frames that are copied through Main → Renderer IPC into a canvas.',
    }
  }

  async load(src: PlaybackSource): Promise<void> {
    this.connect()
    const startSec = src.startTicks ? src.startTicks / TICKS_PER_SECOND : 0
    this.state = { timeSec: startSec, durationSec: 0, paused: false, ended: false }
    this.player!.load(src.url, startSec)
    this.loaded = true
    this.renderFrame()
  }

  play(): void {
    this.player?.setPause(false)
  }

  pause(): void {
    this.player?.setPause(true)
  }

  stop(): void {
    this.loaded = false
    this.player?.setPause(true)
  }

  seek(seconds: number): void {
    this.player?.seek(seconds)
    this.renderFrame()
  }

  setAudioTrack(index: number): void {
    this.player?.setAudioTrack(index)
  }

  setSubtitle(index: number | null): void {
    this.player?.setSubtitle(index)
  }

  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1
    this.player?.setVolume(this.volume)
  }

  setFrameSize(width: number, height: number): void {
    const next = normalizeSoftwareFrameSize(width, height, this.tuning)
    if (next.width === this.width && next.height === this.height) return
    this.width = next.width
    this.height = next.height
  }

  async loadAssOverlay(): Promise<void> {
    // L3 keeps danmaku in the HTML overlay. Baking ASS into mpv's RGBA frame
    // would duplicate it and blur it when the video frame is scaled.
  }

  on(event: PlayerEventName, cb: (payload: PlayerStateEvent) => void): void {
    const arr = this.listeners.get(event) ?? []
    arr.push(cb)
    this.listeners.set(event, arr)
  }

  onFrame(cb: (frame: PlayerVideoFrameEvent) => void): void {
    this.frameListeners.push(cb)
  }

  dispose(): void {
    this.loaded = false
    if (this.frameTimer) clearInterval(this.frameTimer)
    if (this.stateTimer) clearInterval(this.stateTimer)
    this.frameTimer = undefined
    this.stateTimer = undefined
    this.listeners.clear()
    this.frameListeners.length = 0
    this.player?.dispose()
    this.player = null
  }

  private connect(): void {
    if (this.player) return
    const mod = loadNativeModule()
    this.backend = resolveLibmpvRenderBackend(mod.getRenderBackendReport(), {
      DMEMBY_L3_RENDER_BACKEND: process.env.DMEMBY_L3_RENDER_BACKEND,
    })
    if (this.backend.id !== 'software') {
      throw new Error(`L3 render backend ${this.backend.id} is selected but not implemented in LibmpvRenderEngine yet`)
    }
    this.player = new mod.Player()
    this.player.setVolume(this.volume)
    this.frameTimer = setInterval(() => this.renderFrame(), this.frameIntervalMs)
    this.stateTimer = setInterval(() => this.pollState(), this.stateIntervalMs)
  }

  private pollState(): void {
    if (!this.player || !this.loaded) return
    try {
      const next = this.player.getState()
      const prev = this.state
      this.state = {
        timeSec: Number.isFinite(next.timeSec) ? next.timeSec : prev.timeSec,
        durationSec: Number.isFinite(next.durationSec) ? next.durationSec : prev.durationSec,
        paused: next.paused,
        ended: next.ended,
      }
      if (this.state.timeSec !== prev.timeSec || this.state.durationSec !== prev.durationSec) {
        this.emit('timeupdate', this.state)
      }
      if (this.state.paused !== prev.paused) this.emit(this.state.paused ? 'pause' : 'play', this.state)
      if (this.state.ended && !prev.ended) this.emit('ended', this.state)
    } catch (e) {
      this.emitError(e)
    }
  }

  private renderFrame(): void {
    if (!this.player || !this.loaded || this.rendering) return
    this.rendering = true
    try {
      const frame = this.player.renderFrame(this.width, this.height)
      for (const cb of this.frameListeners) {
        cb({
          width: frame.width,
          height: frame.height,
          format: frame.format,
          data: frame.data,
        })
      }
    } catch (e) {
      this.emitError(e)
    } finally {
      this.rendering = false
    }
  }

  private emit(event: PlayerEventName, payload: PlayerStateEvent): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload)
  }

  private emitError(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e)
    this.state = { ...this.state, error: message }
    this.emit('error', this.state)
  }
}

function loadNativeModule(): NativeModule {
  if (!nativeModule) {
    nativeModule = require('@danmaku-emby/mpv-render') as NativeModule
  }
  return nativeModule
}
