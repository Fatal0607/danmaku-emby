export interface PlayerState {
  timeSec: number
  durationSec: number
  paused: boolean
  ended: boolean
}

export interface RenderedFrame {
  width: number
  height: number
  format: 'rgba'
  updated: boolean
  data: Buffer
}

export interface OpenGLProbeFrame {
  backend: 'opengl'
  width: number
  height: number
  format: 'rgba'
  data: Buffer
}

export interface OpenGLTextureInfo {
  backend: 'opengl'
  width: number
  height: number
  internalFormat: 'rgba8'
  textureId: number
  fbo: number
}

export type RenderBackendId = 'software' | 'opengl' | 'metal'

export interface RenderBackendInfo {
  id: RenderBackendId
  apiType: 'sw' | 'opengl' | 'metal'
  available: boolean
  zeroCopy: boolean
  reason: string
}

export interface RenderBackendReport {
  activeBackend: RenderBackendId
  backends: RenderBackendInfo[]
}

export function getRenderBackendReport(): RenderBackendReport

export function renderOpenGLProbeFrame(width: number, height: number): OpenGLProbeFrame

export class OpenGLRenderer {
  constructor(width: number, height: number)
  load(url: string, startSec?: number): void
  renderFrame(): OpenGLProbeFrame
  getTextureInfo(): OpenGLTextureInfo
  dispose(): void
}

export class Player {
  constructor()
  load(url: string, startSec?: number): void
  setPause(paused: boolean): void
  seek(seconds: number): void
  setAudioTrack(index: number): void
  setSubtitle(index: number | null): void
  setVolume(volume: number): void
  addSubtitle(path: string): void
  renderFrame(width: number, height: number): RenderedFrame
  getState(): PlayerState
  dispose(): void
}
