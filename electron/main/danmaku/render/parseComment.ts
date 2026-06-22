import type { CommentEntity, ParsedComment } from '@shared/types/danmaku'

/**
 * Parse a canonical `{p,m}` comment. `p = "time,mode,color,userHash"` where
 * time is seconds (float), mode ∈ {1 scroll, 4 bottom, 5 top}, color is decimal
 * RGB. Returns null for malformed rows so callers can skip defensively.
 */
export function parseComment(c: CommentEntity): ParsedComment | null {
  const parts = c.p.split(',')
  if (parts.length < 3) return null

  const timeSec = Number(parts[0])
  const rawMode = Number(parts[1])
  const color = Number(parts[2])

  if (!Number.isFinite(timeSec) || timeSec < 0) return null
  if (!Number.isFinite(color)) return null

  const mode: ParsedComment['mode'] = rawMode === 4 ? 4 : rawMode === 5 ? 5 : 1

  return {
    timeSec,
    mode,
    color: Number.isFinite(color) ? color : 0xffffff,
    text: c.m,
  }
}

/** Decimal RGB → ASS `&HBBGGRR&` (note BGR byte order). */
export function rgbToAssBgr(color: number): string {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
  return `&H${hex(b)}${hex(g)}${hex(r)}&`
}

/** Escape text for an ASS dialogue line. */
export function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '\\​') // neutralize stray backslashes
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, ' ')
}

/** ASS timestamp `H:MM:SS.cc` from seconds. */
export function assTime(sec: number): string {
  const clamped = Math.max(0, sec)
  const h = Math.floor(clamped / 3600)
  const m = Math.floor((clamped % 3600) / 60)
  const s = Math.floor(clamped % 60)
  const cs = Math.round((clamped - Math.floor(clamped)) * 100)
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0')
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`
}
