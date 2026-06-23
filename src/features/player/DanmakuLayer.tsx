import { useEffect, useMemo, useRef, useState } from 'react'
import type { DanmakuComment } from '@shared/types/domain'
import type { DanmakuSettings } from '@/lib/store'
import { danmakuStream } from '@/lib/mockData'
import './danmaku.css'

interface ActiveComment extends DanmakuComment {
  key: string
  laneTop: number
  duration: number
}

const LANES = 9
const LANE_HEIGHT = 38
// Playhead jumps larger than this (seek) reset the overlay instead of flooding
// it with every comment in the skipped span.
const SEEK_THRESHOLD = 2

/**
 * Bilibili-style danmaku overlay. When a real `comments` track is supplied it
 * emits comments time-synced to the playhead (`time`); without one it falls back
 * to the mock stream so the browser preview stays lively. Honors opacity /
 * fontScale / speed / area / density from the danmaku settings. The eventual
 * mpv build renders the ASS track from DanmakuService (docs 04 §4.8) instead.
 */
export function DanmakuLayer({
  settings,
  playing,
  time,
  comments,
}: {
  settings: DanmakuSettings
  playing: boolean
  time?: number
  comments?: DanmakuComment[]
}) {
  const [active, setActive] = useState<ActiveComment[]>([])
  const idSeq = useRef(0)
  const laneRing = useRef(0)

  const laneCount = useMemo(() => {
    if (settings.area === 'top') return Math.max(1, Math.round(LANES / 3))
    if (settings.area === 'half') return Math.max(1, Math.round(LANES / 2))
    return LANES
  }, [settings.area])

  const hasTrack = !!(comments && comments.length)

  // Build an active comment and schedule its removal once it has cleared.
  const spawn = (src: DanmakuComment) => {
    const lane = laneRing.current++ % laneCount
    const duration = (10 / settings.speed) * (0.85 + Math.random() * 0.3)
    const comment: ActiveComment = {
      ...src,
      key: `c-${idSeq.current++}`,
      laneTop: lane * LANE_HEIGHT + 16,
      duration,
    }
    setActive((prev) => [...prev, comment])
    window.setTimeout(() => {
      setActive((prev) => prev.filter((c) => c.key !== comment.key))
    }, duration * 1000)
  }

  // Time-synced emission for a real track.
  const cursor = useRef(0)
  const lastTime = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!hasTrack || !settings.enabled || time == null) return
    const list = comments!
    const prev = lastTime.current

    // Initial render or a seek: jump the cursor to the playhead, don't backfill.
    if (prev == null || time < prev || time - prev > SEEK_THRESHOLD) {
      let lo = 0
      let hi = list.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (list[mid].timeSec < time) lo = mid + 1
        else hi = mid
      }
      cursor.current = lo
      setActive([])
      lastTime.current = time
      return
    }

    while (cursor.current < list.length && list[cursor.current].timeSec <= time) {
      const src = list[cursor.current++]
      if (Math.random() <= settings.density) spawn(src)
    }
    lastTime.current = time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, hasTrack, settings.enabled, settings.density])

  // Mock fallback: emit from the canned stream on an interval (preview only).
  const mockCursor = useRef(0)
  useEffect(() => {
    if (hasTrack || !settings.enabled || !playing) return
    const interval = window.setInterval(() => {
      if (Math.random() > settings.density) return
      spawn(danmakuStream[mockCursor.current++ % danmakuStream.length])
    }, 420)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTrack, settings.enabled, settings.density, settings.speed, playing])

  if (!settings.enabled) return null

  return (
    <div
      className="danmaku-layer"
      style={{ opacity: settings.opacity, fontSize: `${20 * settings.fontScale}px` }}
      aria-hidden="true"
    >
      {active.map((c) =>
        c.mode === 'scroll' ? (
          <span
            key={c.key}
            className="dm-comment dm-scroll"
            style={{
              top: c.laneTop,
              color: c.color,
              animationDuration: `${c.duration}s`,
            }}
          >
            {c.text}
          </span>
        ) : (
          <span
            key={c.key}
            className={`dm-comment dm-fixed dm-${c.mode}`}
            style={{ color: c.color }}
          >
            {c.text}
          </span>
        ),
      )}
    </div>
  )
}
