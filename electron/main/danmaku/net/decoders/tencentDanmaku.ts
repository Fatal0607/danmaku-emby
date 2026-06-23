import type { CommentEntity } from '@shared/types/danmaku'
import type { TxSegmentResponse } from '../../providers/tencent/types'

// Decode a Tencent danmaku segment (barrage/segment/{vid}/{name}) into canonical
// {p,m} comments (docs 04 §4.5). `time_offset` is milliseconds; Tencent comments
// are scroll-only (mode 1). Color comes from `content_style.gradient_colors[0]`
// → `content_style.color` → default white.

const DEFAULT_COLOR = 16777215
const WHITE_HEX = 'ffffff'

export function parseTencentSegment(seg: TxSegmentResponse): CommentEntity[] {
  const out: CommentEntity[] = []
  for (const item of seg.barrage_list ?? []) {
    const text = (item.content ?? '').trim()
    if (!text) continue

    const timeSec = Number(item.time_offset) / 1000
    if (!Number.isFinite(timeSec) || timeSec < 0) continue

    const color = extractColor(item.content_style)
    out.push({ p: `${timeSec.toFixed(2)},1,${color},`, m: text })
  }
  return out
}

/** Pull a decimal RGB color out of the loosely-typed `content_style` JSON. */
function extractColor(style?: string): number {
  if (!style) return DEFAULT_COLOR
  let parsed: { color?: string; gradient_colors?: string[] }
  try {
    parsed = JSON.parse(style)
  } catch {
    return DEFAULT_COLOR
  }

  const gradient = parsed.gradient_colors
  const hex = gradient && gradient.length ? gradient[0] : parsed.color
  if (typeof hex !== 'string') return DEFAULT_COLOR

  const normalized = hex.replace(/^#/, '')
  // White is the implicit default — don't let a literal "ffffff" override it.
  if (normalized.toLowerCase() === WHITE_HEX) return DEFAULT_COLOR

  const value = parseInt(normalized, 16)
  return Number.isFinite(value) ? value : DEFAULT_COLOR
}
