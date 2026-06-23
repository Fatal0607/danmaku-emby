import { TICKS_PER_SECOND, type PlaybackSource, type ProgressReport } from '@shared/types/emby'
import type {
  PlayerCommand,
  PlayerLoadRequest,
  PlayerLoadResult,
  PlayerStatePush,
} from '@shared/types/player'
import type { CommentEntity, DanmakuMatchInput, DanmakuTrack } from '@shared/types/danmaku'
import type { PlayerEngine, PlayerStateEvent } from './PlayerEngine'
import type { AssOptions } from '../danmaku/render/toAss'

// Narrow dependencies (testable without the full AppServices/Electron).

export interface PlaybackResolver {
  resolvePlayback(serverId: string, itemId: string, startTicks?: number): Promise<PlaybackSource>
  reportProgress(report: ProgressReport): Promise<void>
}

export interface DanmakuOverlaySource {
  autoMatch(input: DanmakuMatchInput): Promise<DanmakuTrack | null>
  toAss(comments: CommentEntity[], opts?: Partial<AssOptions>): string
}

export interface StateSender {
  send(state: PlayerStatePush): void
}

export interface PlayerControllerOptions {
  /** Min gap between 'progress' reports to Emby (docs 02 §2.6). */
  progressIntervalMs?: number
  now?: () => number
}

const DEFAULT_PROGRESS_INTERVAL_MS = 10_000

interface CurrentPlayback {
  serverId: string
  itemId: string
  mediaSourceId: string
  playMethod: PlaybackSource['mode']
}

/**
 * Owns the active PlayerEngine (docs 03 §3.3): resolves an Emby item to a
 * playback source, loads it into mpv, overlays auto-matched danmaku, forwards
 * engine state to the renderer (PLAYER_STATE), and throttles Emby progress
 * reports off the mpv `time-pos` stream (docs 02 §2.6, roadmap item #6).
 */
export class PlayerController {
  private current?: CurrentPlayback
  private lastState: PlayerStateEvent = {
    timeSec: 0,
    durationSec: 0,
    paused: false,
    ended: false,
  }
  private lastReportAt = 0
  private readonly progressIntervalMs: number
  private readonly now: () => number
  private disposed = false

  constructor(
    private readonly engine: PlayerEngine,
    private readonly emby: PlaybackResolver,
    private readonly danmaku: DanmakuOverlaySource,
    private readonly sender: StateSender,
    opts: PlayerControllerOptions = {},
  ) {
    this.progressIntervalMs = opts.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS
    this.now = opts.now ?? Date.now
    this.engine.on('timeupdate', (s) => this.onTimeUpdate(s))
    this.engine.on('pause', (s) => this.onPauseToggle(s))
    this.engine.on('play', (s) => this.onPauseToggle(s))
    this.engine.on('ended', (s) => this.onEnded(s))
    this.engine.on('error', (s) => this.sender.send(toPush(s)))
  }

  /** Resolve → load → overlay danmaku → play → report 'start'. */
  async load(req: PlayerLoadRequest): Promise<PlayerLoadResult> {
    this.disposed = false
    await this.reportStop() // close out any prior session

    const src = await this.emby.resolvePlayback(req.serverId, req.itemId, req.startTicks)
    await this.engine.load(src)
    this.current = {
      serverId: req.serverId,
      itemId: req.itemId,
      mediaSourceId: src.mediaSourceId,
      playMethod: src.mode,
    }
    this.lastState = {
      timeSec: (req.startTicks ?? src.startTicks ?? 0) / TICKS_PER_SECOND,
      durationSec: src.runTimeTicks ? src.runTimeTicks / TICKS_PER_SECOND : 0,
      paused: false,
      ended: false,
    }

    const danmakuCount = req.withDanmaku === false ? 0 : await this.tryOverlayDanmaku(req, src)

    this.engine.play()
    this.lastReportAt = this.now()
    await this.report('start')

    return {
      durationSec: this.lastState.durationSec,
      danmakuCount,
      playMethod: src.mode,
    }
  }

  async command(cmd: PlayerCommand): Promise<void> {
    switch (cmd.type) {
      case 'play':
        this.engine.play()
        break
      case 'pause':
        this.engine.pause()
        break
      case 'stop':
        await this.stopPlayback()
        break
      case 'seek':
        this.engine.seek(cmd.seconds)
        break
      case 'setAudioTrack':
        this.engine.setAudioTrack(cmd.index)
        break
      case 'setSubtitle':
        this.engine.setSubtitle(cmd.index)
        break
      case 'setFrameSize':
        this.engine.setFrameSize?.(cmd.width, cmd.height)
        break
    }
  }

  /** Stop reporting + tear down the engine (app quit / view change). */
  async dispose(): Promise<void> {
    this.disposed = true
    await this.reportStop()
    this.engine.dispose()
  }

  private async overlayDanmaku(req: PlayerLoadRequest, src: PlaybackSource): Promise<number> {
    if (!this.engine.loadAssOverlay) return 0
    const input: DanmakuMatchInput = {
      embyItemId: req.itemId,
      serverId: req.serverId,
      fileName: src.fileName ?? '',
      fileSize: src.fileSize,
      videoDurationSec: src.runTimeTicks ? src.runTimeTicks / TICKS_PER_SECOND : undefined,
    }
    const track = await this.danmaku.autoMatch(input)
    if (!track?.comments.length) return 0
    const ass = this.danmaku.toAss(track.comments)
    await this.engine.loadAssOverlay(ass)
    return track.commentCount
  }

  private async tryOverlayDanmaku(req: PlayerLoadRequest, src: PlaybackSource): Promise<number> {
    try {
      return await this.overlayDanmaku(req, src)
    } catch {
      // Danmaku is additive. Provider/network/ASS errors must not abort video.
      return 0
    }
  }

  private async stopPlayback(): Promise<void> {
    this.engine.stop?.()
    if (!this.engine.stop) this.engine.pause()
    this.lastState = { ...this.lastState, paused: true, ended: false }
    this.sender.send(toPush(this.lastState))
    await this.reportStop()
  }

  private onTimeUpdate(s: PlayerStateEvent): void {
    if (this.disposed) return
    this.lastState = { ...this.lastState, timeSec: s.timeSec, durationSec: s.durationSec || this.lastState.durationSec }
    this.sender.send(toPush(this.lastState))
    if (this.current && this.now() - this.lastReportAt >= this.progressIntervalMs) {
      this.lastReportAt = this.now()
      void this.report('progress')
    }
  }

  private onPauseToggle(s: PlayerStateEvent): void {
    if (this.disposed) return
    this.lastState = { ...this.lastState, paused: s.paused }
    this.sender.send(toPush(this.lastState))
    void this.report('progress')
  }

  private onEnded(s: PlayerStateEvent): void {
    if (this.disposed) return
    this.lastState = { ...this.lastState, ended: true, timeSec: s.timeSec || this.lastState.timeSec }
    this.sender.send(toPush(this.lastState))
    void this.reportStop()
  }

  private async report(
    event: ProgressReport['event'],
    cur = this.current,
  ): Promise<void> {
    if (!cur) return
    try {
      await this.emby.reportProgress({
        serverId: cur.serverId,
        itemId: cur.itemId,
        mediaSourceId: cur.mediaSourceId,
        positionTicks: Math.round(this.lastState.timeSec * TICKS_PER_SECOND),
        isPaused: this.lastState.paused,
        event,
        playMethod: cur.playMethod,
      })
    } catch {
      // Progress reporting is best-effort — never break playback over it.
    }
  }

  /** Clear the session synchronously so a concurrent stop can't double-report. */
  private async reportStop(): Promise<void> {
    const cur = this.current
    if (!cur) return
    this.current = undefined
    await this.report('stop', cur)
  }
}

function toPush(s: PlayerStateEvent): PlayerStatePush {
  return {
    timeSec: s.timeSec,
    durationSec: s.durationSec,
    paused: s.paused,
    ended: s.ended,
    error: s.error,
  }
}
