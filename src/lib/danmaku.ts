import type { CommentEntity, DanmakuProvider, DanmakuTrack } from '@shared/types/danmaku'
import type { DanmakuComment } from '@shared/types/domain'

// Renderer-side helpers that turn canonical `{p,m}` comments (docs 04 §4.2) into
// the view model the React danmaku overlay renders. Mirrors the `p`-string
// convention used by the Main process (electron/main/danmaku/render/parseComment).

/** Human-facing provider label for the player chrome. */
export const PROVIDER_LABELS: Record<DanmakuProvider, string> = {
  dandanplay: '弹弹play',
  bilibili: '哔哩哔哩',
  tencent: '腾讯视频',
}

/** Decimal RGB (e.g. 16777215) → CSS hex `#rrggbb`. */
export function decimalColorToHex(color: number): string {
  const c = (color >>> 0) & 0xffffff
  return `#${c.toString(16).padStart(6, '0')}`
}

/** dandanplay/bilibili mode: 1 scroll, 4 bottom, 5 top. */
function modeToView(mode: number): DanmakuComment['mode'] {
  return mode === 4 ? 'bottom' : mode === 5 ? 'top' : 'scroll'
}

/** Parse one `{p,m}` comment, or null when the row is malformed. */
export function commentToView(c: CommentEntity, index: number): DanmakuComment | null {
  const parts = c.p.split(',')
  if (parts.length < 3) return null

  const timeSec = Number(parts[0])
  const mode = Number(parts[1])
  const color = Number(parts[2])
  if (!Number.isFinite(timeSec) || timeSec < 0) return null

  return {
    id: `dm-${index}`,
    timeSec,
    text: c.m,
    color: Number.isFinite(color) ? decimalColorToHex(color) : '#ffffff',
    lane: 0,
    mode: modeToView(mode),
  }
}

/** Convert a fetched track into a time-sorted list of renderable comments. */
export function trackToComments(track: DanmakuTrack | null | undefined): DanmakuComment[] {
  if (!track) return []
  return track.comments
    .map((c, i) => commentToView(c, i))
    .filter((c): c is DanmakuComment => c !== null)
    .sort((a, b) => a.timeSec - b.timeSec)
}
