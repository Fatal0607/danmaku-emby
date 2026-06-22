import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { TrafficLights } from '@/components/ui/primitives'
import { useUI } from '@/lib/store'
import { catalog } from '@/lib/mockData'
import { DanmakuLayer } from './DanmakuLayer'
import { DanmakuSettings } from './DanmakuSettings'
import { DanmakuMatch } from './DanmakuMatch'
import './player.css'

const TOTAL = 2828 // 47:08 in seconds

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Player() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { danmaku, setDanmaku } = useUI()
  const item = catalog.find((c) => c.id === id) ?? catalog[0]

  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(Math.round(TOTAL * (item.progress ?? 0.26)))
  const [volume, setVolume] = useState(0.8)
  const [showSettings, setShowSettings] = useState(false)
  const [showMatch, setShowMatch] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const hideTimer = useRef<number | undefined>(undefined)

  // Advance the simulated playhead.
  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => {
      setTime((prev) => (prev >= TOTAL ? TOTAL : prev + 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [playing])

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

  const progress = time / TOTAL

  return (
    <div
      className={`player${chromeVisible ? '' : ' chrome-hidden'}`}
      onMouseMove={wake}
    >
      {/* Video stage (gradient stand-in for the mpv surface) */}
      <div
        className="player-stage"
        style={{ background: `radial-gradient(120% 120% at 30% 20%, ${item.poster[0]}, ${item.poster[1]} 70%, #04060a)` }}
        onClick={() => setPlaying((p) => !p)}
      >
        <div className="player-grain" />
        {!playing && (
          <button className="player-big-play" onClick={(e) => { e.stopPropagation(); setPlaying(true) }} aria-label="播放">
            <Icon name="play" size={40} color="#fff" />
          </button>
        )}
      </div>

      {/* Danmaku overlay */}
      <DanmakuLayer settings={danmaku} playing={playing} />

      {/* Top bar */}
      <div className="player-topbar">
        <TrafficLights style={{ position: 'absolute', top: 18, left: 18 }} />
        <button className="player-back" onClick={() => navigate(-1)}>
          <Icon name="back" size={18} color="#fff" />
        </button>
        <div className="player-titleblock">
          <div className="player-title">{item.title}</div>
          <div className="player-subtitle">
            {item.episodeLabel ?? `${item.year}`} · {item.danmaku.provider ?? '无弹幕'}
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
              setTime(Math.round(((e.clientX - r.left) / r.width) * TOTAL))
            }}
          >
            <div className="scrub-buffer" style={{ width: `${Math.min(100, progress * 100 + 12)}%` }} />
            <div className="scrub-fill" style={{ width: `${progress * 100}%` }}>
              <span className="scrub-thumb" />
            </div>
          </div>
          <span className="time-code time-total">{fmt(TOTAL)}</span>
        </div>

        <div className="player-buttons">
          <div className="player-buttons-left">
            <button className="ctrl ctrl-primary" onClick={() => setPlaying((p) => !p)} aria-label={playing ? '暂停' : '播放'}>
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

      {showSettings && <DanmakuSettings onClose={() => setShowSettings(false)} />}
      {showMatch && <DanmakuMatch onClose={() => setShowMatch(false)} />}
    </div>
  )
}
