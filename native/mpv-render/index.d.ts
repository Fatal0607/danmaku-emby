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

export class Player {
  constructor()
  load(url: string, startSec?: number): void
  setPause(paused: boolean): void
  seek(seconds: number): void
  setAudioTrack(index: number): void
  setSubtitle(index: number | null): void
  addSubtitle(path: string): void
  renderFrame(width: number, height: number): RenderedFrame
  getState(): PlayerState
  dispose(): void
}
