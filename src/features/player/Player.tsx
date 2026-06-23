import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { DanmakuMatchInput } from '@shared/types/danmaku'
import { TICKS_PER_SECOND } from '@shared/types/emby'
import type { PlayerCommand, PlayerLoadResult, PlayerVideoFramePush } from '@shared/types/player'
import { Icon } from '@/components/ui/Icon'
import { TrafficLights } from '@/components/ui/primitives'
import { useUI } from '@/lib/store'
import { catalog } from '@/lib/mockData'
import { useCurrentServerId, useDanmakuTrack, useMediaItem } from '@/lib/queries'
import { PROVIDER_LABELS, trackToComments } from '@/lib/danmaku'
import { getPlayerSource } from '@/lib/playerSource'
import { DanmakuLayer } from './DanmakuLayer'
import { DanmakuSettings } from './DanmakuSettings'
import { DanmakuMatch } from './DanmakuMatch'
import './player.css'

const MOCK_TOTAL = 2828 // 47:08 in seconds

function fmt(sec: number) {
  const safe = Number.isFinite(sec) ? Math.max(0, sec) : 0
  const m = Math.floor(safe / 60)
  const s = Math.floor(safe % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function clampTime(sec: number, duration: number) {
  const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER
  return Math.max(0, Math.min(max, sec))
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function frameBytes(data: PlayerVideoFramePush['data']): Uint8Array {
  if (data instanceof Uint8Array) return data
  return new Uint8Array(data as unknown as ArrayBuffer)
}

function drawVideoFrame(canvas: HTMLCanvasElement | null, frame: PlayerVideoFramePush): boolean {
  if (!canvas || frame.format !== 'rgba') return false
  const bytes = frameBytes(frame.data)
  const expected = frame.width * frame.height * 4
  if (bytes.byteLength < expected) return false

  if (canvas.width !== frame.width) canvas.width = frame.width
  if (canvas.height !== frame.height) canvas.height = frame.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  const rgba = new Uint8ClampedArray(expected)
  rgba.set(bytes.subarray(0, expected))
  ctx.putImageData(new ImageData(rgba, frame.width, frame.height), 0, 0)
  return true
}

export function Player() {
  const { id } = useParams<{ id: string }>()
  const routeItemId = id ?? catalog[0].id
  const navigate = useNavigate()
  const { danmaku, setDanmaku } = useUI()
  const serverId = useCurrentServerId()
  const playerSource = useMemo(() => getPlayerSource(), [])
  const isRealPlayer = playerSource.kind === 'electron'
  const mediaQuery = useMediaItem(serverId, routeItemId)
  const fallbackItem = useMemo(
    () => catalog.find((c) => c.id === routeItemId) ?? catalog[0],
    [routeItemId],
  )
  const item = mediaQuery.data ?? fallbackItem

  const itemDuration = item.durationSec ?? MOCK_TOTAL
  const itemResumeTime =
    item.playbackPositionTicks != null
      ? item.playbackPositionTicks / TICKS_PER_SECOND
      : Math.round(itemDuration * (item.progress ?? 0.26))

  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(() => itemResumeTime)
  const [duration, setDuration] = useState(() => itemDuration)
  const [volume, setVolume] = useState(0.8)
  const [showSettings, setShowSettings] = useState(false)
  const [showMatch, setShowMatch] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [playbackError, setPlaybackError] = useState<string | undefined>()
  const [loadingPlayback, setLoadingPlayback] = useState(false)
  const [loadResult, setLoadResult] = useState<PlayerLoadResult | null>(null)
  const [hasVideoFrame, setHasVideoFrame] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const loadKeyRef = useRef<string | null>(null)
  const lastFrameSizeRef = useRef<string>('')
  const playerStageRef = useRef<HTMLDivElement | null>(null)
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!isRealPlayer) return
    document.documentElement.classList.add('player-overlay-html')
    document.body.classList.add('player-overlay-body')
    return () => {
      document.documentElement.classList.remove('player-overlay-html')
      document.body.classList.remove('player-overlay-body')
    }
  }, [isRealPlayer])

  useEffect(() => {
    if (!isRealPlayer) return
    return () => {
      playerSource.command({ type: 'stop' }).catch(() => {})
    }
  }, [isRealPlayer, playerSource])

  useEffect(() => {
    if (!isRealPlayer) return
    return playerSource.onFrame((frame) => {
      if (drawVideoFrame(videoCanvasRef.current, frame)) setHasVideoFrame(true)
    })
  }, [isRealPlayer, playerSource])

  useEffect(() => {
    if (!isRealPlayer) return
    const stage = playerStageRef.current
    if (!stage) return

    const sendFrameSize = () => {
      const rect = stage.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.round(rect.width * dpr)
      const height = Math.round(rect.height * dpr)
      if (width <= 0 || height <= 0) return

      const key = `${width}x${height}`
      if (lastFrameSizeRef.current === key) return
      lastFrameSizeRef.current = key
      playerSource.command({ type: 'setFrameSize', width, height }).catch(() => {})
    }

    sendFrameSize()
    const observer = new ResizeObserver(sendFrameSize)
    observer.observe(stage)
    window.addEventListener('resize', sendFrameSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sendFrameSize)
    }
  }, [isRealPlayer, playerSource])

  // Keep the browser preview behavior: local mock playhead over mock data.
  useEffect(() => {
    if (isRealPlayer) return
    setDuration(itemDuration)
    setTime(itemResumeTime)
    setPlaying(true)
  }, [isRealPlayer, itemDuration, itemResumeTime, routeItemId])

  useEffect(() => {
    if (isRealPlayer || !playing) return
    const t = window.setInterval(() => {
      setTime((prev) => (prev >= duration ? duration : prev + 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [duration, isRealPlayer, playing])

  // Electron path: PLAYER_STATE (mpv time-pos) is the single source of truth
  // for the UI/danmaku clock once real playback starts.
  useEffect(() => {
    let active = true
    if (!isRealPlayer) return

    const unsubscribe = playerSource.onState((state) => {
      if (!active) return
      if (state.durationSec > 0) setDuration(state.durationSec)
      setTime(clampTime(state.timeSec, state.durationSec || itemDuration))
      setPlaying(!state.paused && !state.ended)
      if (state.error) setPlaybackError(state.error)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [isRealPlayer, itemDuration, playerSource])

  // Load once per real server/item. Waiting for the item query preserves Emby's
  // resume position without firing a second mpv load when that data arrives.
  useEffect(() => {
    if (!isRealPlayer || !serverId || !routeItemId) return
    if (mediaQuery.isLoading && !mediaQuery.data) return

    const loadKey = `${serverId}:${routeItemId}`
    if (loadKeyRef.current === loadKey) return
    loadKeyRef.current = loadKey

    setHasVideoFrame(false)
    let active = true
    const startTicks = mediaQuery.data?.playbackPositionTicks ?? item.playbackPositionTicks

    setLoadingPlayback(true)
    setPlaybackError(undefined)
    setLoadResult(null)
    setDuration(itemDuration)
    setTime(clampTime(startTicks != null ? startTicks / TICKS_PER_SECOND : 0, itemDuration))
    setPlaying(true)

    playerSource
      .load({
        serverId,
        itemId: routeItemId,
        startTicks,
      })
      .then((res) => {
        if (!active) return
        setLoadResult(res)
        if (res.durationSec > 0) setDuration(res.durationSec)
        setLoadingPlayback(false)
      })
      .catch((e) => {
        if (!active) return
        setPlaybackError(messageOf(e))
        setPlaying(false)
        setLoadingPlayback(false)
        loadKeyRef.current = null
      })

    return () => {
      active = false
    }
  }, [
    isRealPlayer,
    item.playbackPositionTicks,
    itemDuration,
    mediaQuery.data?.playbackPositionTicks,
    mediaQuery.isLoading,
    playerSource,
    routeItemId,
    serverId,
  ])

  // Auto-match the playing item to a danmaku track. The Electron controller also
  // overlays ASS into mpv; this renderer track drives the HTML danmaku layer.
  const matchInput = useMemo<DanmakuMatchInput | undefined>(() => {
    if (!serverId || (isRealPlayer && mediaQuery.isLoading)) return undefined
    return {
      embyItemId: routeItemId,
      serverId,
      fileName: item.title,
      seriesTitle: item.title,
      videoDurationSec: duration || itemDuration,
    }
  }, [
    duration,
    isRealPlayer,
    item.title,
    itemDuration,
    mediaQuery.isLoading,
    routeItemId,
    serverId,
  ])
  const { data: track } = useDanmakuTrack(matchInput)
  const comments = useMemo(() => trackToComments(track), [track])
  const providerLabel = track ? PROVIDER_LABELS[track.provider] : undefined

  const commandPlayer = (cmd: PlayerCommand) => {
    if (cmd.type === 'play') setPlaying(true)
    if (cmd.type === 'pause') setPlaying(false)
    if (cmd.type === 'seek') setTime(clampTime(cmd.seconds, duration))

    if (!isRealPlayer) return
    playerSource.command(cmd).catch((e) => setPlaybackError(messageOf(e)))
  }

  const togglePlaying = () => commandPlayer({ type: playing ? 'pause' : 'play' })

  // Auto-hide chrome after inactivity while playing.
  const wake = () => {
    setChromeVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      if (playing && !showSettings && !showMatch) setChromeVisible(false)
    }, 3200)
  }
  useEffect(() => {
    wake()
    return () => window.clearTimeout(hideTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, showSettings, showMatch])

  const progress = duration > 0 ? Math.min(1, time / duration) : 0
  const subtitle = playbackError
    ? `播放错误 · ${playbackError}`
    : loadingPlayback
      ? '正在启动播放器…'
      : track
        ? `${providerLabel} · ${track.commentCount.toLocaleString()} 条`
        : loadResult?.danmakuCount
          ? `${loadResult.danmakuCount.toLocaleString()} 条弹幕`
          : '无弹幕'

  return (
    <div
      className={`player${isRealPlayer ? ' player-real-video' : ''}${chromeVisible ? '' : ' chrome-hidden'}`}
      onMouseMove={wake}
    >
      {/* Video stage: browser preview uses a gradient, Electron L3 draws libmpv frames into the canvas. */}
      <div
        ref={playerStageRef}
        className="player-stage"
        style={
          isRealPlayer
            ? undefined
            : { background: `radial-gradient(120% 120% at 30% 20%, ${item.poster[0]}, ${item.poster[1]} 70%, #04060a)` }
        }
        onClick={togglePlaying}
      >
        {isRealPlayer && (
          <canvas
            ref={videoCanvasRef}
            className={`player-video-canvas${hasVideoFrame ? ' is-visible' : ''}`}
            aria-hidden="true"
          />
        )}
        <div className="player-grain" />
        {!playing && (
          <button className="player-big-play" onClick={(e) => { e.stopPropagation(); commandPlayer({ type: 'play' }) }} aria-label="播放">
            <Icon name="play" size={40} color="#fff" />
          </button>
        )}
      </div>

      {/* Danmaku overlay */}
      <DanmakuLayer settings={danmaku} playing={playing} time={time} comments={comments} />

      {/* Top bar */}
      <div className="player-topbar">
        <TrafficLights style={{ position: 'absolute', top: 18, left: 18 }} />
        <button className="player-back" onClick={() => navigate(-1)}>
          <Icon name="back" size={18} color="#fff" />
        </button>
        <div className="player-titleblock">
          <div className="player-title">{item.title}</div>
          <div className="player-subtitle">
            {item.episodeLabel ?? `${item.year}`} · {subtitle}
          </div>
        </div>
        <div className="player-top-actions">
          <span className={`dm-live ${danmaku.enabled ? 'is-on' : ''}`}>
            <span className="dm-live-dot" />
            弹幕 {danmaku.enabled ? '开' : '关'}
          </span>
        </div>
      </div>

      {/* Bottom transport */}
      <div className="player-controls">
        <div className="player-scrub">
          <span className="time-code">{fmt(time)}</span>
          <div
            className="scrub-track"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const next = clampTime(((e.clientX - r.left) / r.width) * duration, duration)
              commandPlayer({ type: 'seek', seconds: next })
            }}
          >
            <div className="scrub-buffer" style={{ width: `${Math.min(100, progress * 100 + 12)}%` }} />
            <div className="scrub-fill" style={{ width: `${progress * 100}%` }}>
              <span className="scrub-thumb" />
            </div>
          </div>
          <span className="time-code time-total">{fmt(duration)}</span>
        </div>

        <div className="player-buttons">
          <div className="player-buttons-left">
            <button className="ctrl ctrl-primary" onClick={togglePlaying} aria-label={playing ? '暂停' : '播放'}>
              <Icon name={playing ? 'pause' : 'play'} size={20} color="#fff" />
            </button>
            <button className="ctrl" aria-label="下一集">
              <Icon name="next" size={18} color="var(--text-soft)" />
            </button>
            <div className="ctrl-volume">
              <Icon name="volume" size={18} color="var(--text-soft)" />
              <div className="volume-track" onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setVolume(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))
              }}>
                <div className="volume-fill" style={{ width: `${volume * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="player-buttons-right">
            <button className="ctrl ctrl-pill" onClick={() => setShowMatch(true)}>
              匹配弹幕
            </button>
            <button
              className={`ctrl${danmaku.enabled ? ' ctrl-on' : ''}`}
              onClick={() => setDanmaku({ enabled: !danmaku.enabled })}
              aria-label="切换弹幕"
            >
              <Icon name="danmaku" size={18} color={danmaku.enabled ? 'var(--accent-bright)' : 'var(--text-soft)'} />
            </button>
            <button
              className={`ctrl${showSettings ? ' ctrl-on' : ''}`}
              onClick={() => setShowSettings((s) => !s)}
              aria-label="弹幕设置"
            >
              <Icon name="settings" size={18} color={showSettings ? 'var(--accent-bright)' : 'var(--text-soft)'} />
            </button>
            <button className="ctrl" aria-label="全屏">
              <Icon name="fullscreen" size={18} color="var(--text-soft)" />
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <DanmakuSettings
          onClose={() => setShowSettings(false)}
          providerLabel={providerLabel}
          count={track?.commentCount ?? loadResult?.danmakuCount}
        />
      )}
      {showMatch && (
        <DanmakuMatch
          onClose={() => setShowMatch(false)}
          serverId={serverId ?? ''}
          embyItemId={routeItemId}
          defaultQuery={item.title}
        />
      )}
    </div>
  )
}
