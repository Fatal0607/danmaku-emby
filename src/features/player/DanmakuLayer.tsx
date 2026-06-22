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

/**
 * Bilibili-style danmaku overlay. Continuously emits comments from the mock
 * stream while `playing`, honoring opacity / fontScale / speed / area / density
 * from the danmaku settings. A real build would feed time-synced comments from
 * the ASS track produced by DanmakuService (docs/system-design/04-danmaku.md).
 */
export function DanmakuLayer({
  settings,
  playing,
}: {
  settings: DanmakuSettings
  playing: boolean
}) {
  const [active, setActive] = useState<ActiveComment[]>([])
  const cursor = useRef(0)
  const idSeq = useRef(0)

  const laneCount = useMemo(() => {
    if (settings.area === 'top') return Math.round(LANES / 3)
    if (settings.area === 'half') return Math.round(LANES / 2)
    return LANES
  }, [settings.area])

  useEffect(() => {
    if (!settings.enabled || !playing) return
    const interval = window.setInterval(() => {
      // Density gate — skip some emissions when density < 1.
      if (Math.random() > settings.density) return
      const src = danmakuStream[cursor.current % danmakuStream.length]
      cursor.current += 1
      const lane = idSeq.current % laneCount
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
    }, 420)
    return () => window.clearInterval(interval)
  }, [settings.enabled, settings.density, settings.speed, playing, laneCount])

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
