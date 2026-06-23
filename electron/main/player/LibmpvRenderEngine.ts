import { createRequire } from 'node:module'
import { TICKS_PER_SECOND, type PlaybackSource } from '@shared/types/emby'
import {
  MPV_CAPABILITIES,
  type PlayerCapabilities,
  type PlayerEngine,
  type PlayerEventName,
  type PlayerStateEvent,
  type PlayerVideoFrameEvent,
} from './PlayerEngine'

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
  addSubtitle(path: string): void
  renderFrame(width: number, height: number): NativeRenderedFrame
  getState(): NativePlayerState
  dispose(): void
}

interface NativeModule {
  Player: new () => NativePlayer
}

export interface LibmpvRenderEngineOptions {
  width?: number
  height?: number
  frameIntervalMs?: number
  stateIntervalMs?: number
}

const require = createRequire(import.meta.url)
let nativeModule: NativeModule | null = null
const MAX_RENDER_WIDTH = 1920
const MAX_RENDER_HEIGHT = 1080

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
  private readonly frameIntervalMs: number
  private readonly stateIntervalMs: number
  private player: NativePlayer | null = null
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
    this.width = opts.width ?? 1280
    this.height = opts.height ?? 720
    this.frameIntervalMs = opts.frameIntervalMs ?? 66
    this.stateIntervalMs = opts.stateIntervalMs ?? 250
  }

  getCapabilities(): PlayerCapabilities {
    return { ...MPV_CAPABILITIES, hardwareDecode: false }
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

  setFrameSize(width: number, height: number): void {
    const next = normalizeFrameSize(width, height)
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
    this.player = new mod.Player()
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

function normalizeFrameSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1280, height: 720 }
  }

  const scale = Math.min(1, MAX_RENDER_WIDTH / width, MAX_RENDER_HEIGHT / height)
  return {
    width: Math.max(320, Math.round(width * scale)),
    height: Math.max(180, Math.round(height * scale)),
  }
}
