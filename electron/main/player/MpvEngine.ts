import type { PlaybackSource } from '@shared/types/emby'
import {
  MPV_CAPABILITIES,
  type PlayerCapabilities,
  type PlayerEngine,
  type PlayerEventName,
  type PlayerStateEvent,
} from './PlayerEngine'

/**
 * libmpv-backed engine (docs 03 §3.4). MVP target: L1 (mpv child window +
 * ASS overlay). The native binding (node-mpv / N-API addon) is a Spike-A
 * deliverable per docs 07 §7.2 and is not wired in this environment — every
 * control method below is the call site that will dispatch to mpv via JSON IPC
 * (`loadfile`, `set_property pause`, `observe_property time-pos`, …).
 */
export class MpvEngine implements PlayerEngine {
  private listeners = new Map<PlayerEventName, Array<(p: PlayerStateEvent) => void>>()
  private connected = false

  getCapabilities(): PlayerCapabilities {
    return MPV_CAPABILITIES
  }

  async load(src: PlaybackSource): Promise<void> {
    this.ensureConnected()
    // mpv: loadfile <src.url> ; start=<src.startTicks / TICKS_PER_SECOND>
    void src
  }

  play(): void {
    this.ensureConnected()
    // mpv: set_property pause false
  }

  pause(): void {
    this.ensureConnected()
    // mpv: set_property pause true
  }

  seek(seconds: number): void {
    this.ensureConnected()
    // mpv: seek <seconds> absolute
    void seconds
  }

  setAudioTrack(index: number): void {
    this.ensureConnected()
    // mpv: set_property aid <index>
    void index
  }

  setSubtitle(index: number | null): void {
    this.ensureConnected()
    // mpv: set_property sid <index|no>
    void index
  }

  loadAssOverlay(assText: string): void {
    this.ensureConnected()
    // mpv: sub-add <temp.ass> ; or overlay via libass
    void assText
  }

  on(event: PlayerEventName, cb: (payload: PlayerStateEvent) => void): void {
    const arr = this.listeners.get(event) ?? []
    arr.push(cb)
    this.listeners.set(event, arr)
  }

  protected emit(event: PlayerEventName, payload: PlayerStateEvent): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload)
  }

  dispose(): void {
    this.listeners.clear()
    this.connected = false
    // mpv: quit ; close IPC socket
  }

  private ensureConnected(): void {
    if (this.connected) return
    throw new Error(
      'MpvEngine: libmpv binding not initialized — complete Spike A (docs 07 §7.2) to wire the native mpv process.',
    )
  }
}
