import type { CommentEntity, DanmakuRenderPrefs } from '@shared/types/danmaku'
import { DEFAULT_DANMAKU_PREFS } from '@shared/types/danmaku'
import { assTime, escapeAssText, parseComment, rgbToAssBgr } from './parseComment'

export interface AssOptions {
  /** Render canvas size; mpv passes the video resolution. */
  width: number
  height: number
  prefs?: Partial<DanmakuRenderPrefs>
}

const DEFAULT_SIZE = { width: 1920, height: 1080 }
// Average glyph advance as a fraction of font size — used to estimate width.
const GLYPH_RATIO = 1.0
const PX_PER_SECOND = 200 // baseline scroll speed before the speed factor

interface Lane {
  /** time (sec) at which this lane's last comment fully clears the right edge. */
  freeAt: number
}

/**
 * Convert canonical `{p,m}` comments to an ASS subtitle document for libass
 * (mpv L1 rendering, docs 04 §4.8). Scroll comments use `\move`; fixed
 * top/bottom use `\an8`/`\an2`. Lane allocation avoids overlap. Honors
 * opacity / fontSize / speed / area / hideMode / blockKeywords from prefs.
 */
export function toAss(comments: CommentEntity[], opts: Partial<AssOptions> = {}): string {
  const width = opts.width ?? DEFAULT_SIZE.width
  const height = opts.height ?? DEFAULT_SIZE.height
  const prefs: DanmakuRenderPrefs = { ...DEFAULT_DANMAKU_PREFS, ...opts.prefs }

  const fontSize = prefs.fontSize
  const laneHeight = Math.round(fontSize * 1.25)
  const areaRatio = prefs.area === 'top' ? 1 / 3 : prefs.area === 'half' ? 1 / 2 : 1
  const laneCount = Math.max(1, Math.floor((height * areaRatio) / laneHeight))
  const scrollDurationFor = (w: number) => ((width + w) / PX_PER_SECOND) * prefs.speed
  const alphaTag = opacityToAlphaTag(prefs.opacity)

  const scrollLanes: Lane[] = Array.from({ length: laneCount }, () => ({ freeAt: -Infinity }))
  const topLanes: Lane[] = Array.from({ length: laneCount }, () => ({ freeAt: -Infinity }))
  const bottomLanes: Lane[] = Array.from({ length: laneCount }, () => ({ freeAt: -Infinity }))

  const events: string[] = []

  const sorted = comments
    .map(parseComment)
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.timeSec - b.timeSec)

  for (const c of sorted) {
    if (isBlocked(c.text, prefs.blockKeywords)) continue
    const kind = c.mode === 1 ? 'scroll' : c.mode === 5 ? 'top' : 'bottom'
    if (prefs.hideMode.includes(kind)) continue

    const text = escapeAssText(c.text)
    const textWidth = Math.ceil(text.length * fontSize * GLYPH_RATIO)
    const color = rgbToAssBgr(c.color)

    if (kind === 'scroll') {
      const dur = scrollDurationFor(textWidth)
      const lane = allocateScrollLane(scrollLanes, c.timeSec, dur, textWidth, width)
      if (lane < 0) continue // screen saturated at this instant — drop (density)
      const y = lane * laneHeight + laneHeight / 2
      const x1 = width + textWidth / 2
      const x2 = -textWidth / 2
      const move = `\\move(${x1},${y},${x2},${y})`
      events.push(
        dialogue(
          c.timeSec,
          c.timeSec + dur,
          `{${alphaTag}\\c${color}${move}}${text}`,
        ),
      )
    } else {
      const fixedDur = 4
      const lanes = kind === 'top' ? topLanes : bottomLanes
      const lane = allocateFixedLane(lanes, c.timeSec, fixedDur)
      if (lane < 0) continue
      const align = kind === 'top' ? 8 : 2
      const yPos =
        kind === 'top'
          ? lane * laneHeight + laneHeight / 2
          : height - (lane * laneHeight + laneHeight / 2)
      const pos = `\\an${align}\\pos(${Math.round(width / 2)},${Math.round(yPos)})`
      events.push(
        dialogue(c.timeSec, c.timeSec + fixedDur, `{${alphaTag}\\c${color}${pos}}${text}`),
      )
    }
  }

  return buildDocument(width, height, fontSize, events)
}

function allocateScrollLane(
  lanes: Lane[],
  startSec: number,
  durSec: number,
  textWidth: number,
  screenWidth: number,
): number {
  // A lane is reusable once the previous comment's tail has entered the screen
  // (so the new head doesn't collide). Approx: previous comment must have
  // travelled its own width past the right edge.
  const entryTime = (textWidth / (screenWidth + textWidth)) * durSec
  for (let i = 0; i < lanes.length; i++) {
    if (startSec >= lanes[i].freeAt) {
      lanes[i].freeAt = startSec + entryTime
      return i
    }
  }
  return -1
}

function allocateFixedLane(lanes: Lane[], startSec: number, durSec: number): number {
  for (let i = 0; i < lanes.length; i++) {
    if (startSec >= lanes[i].freeAt) {
      lanes[i].freeAt = startSec + durSec
      return i
    }
  }
  return -1
}

function isBlocked(text: string, keywords: string[]): boolean {
  if (!keywords.length) return false
  return keywords.some((k) => k && text.includes(k))
}

/** Opacity 0..1 → ASS `\alpha&HXX&` (00 opaque … FF transparent). */
function opacityToAlphaTag(opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity))
  const a = Math.round((1 - clamped) * 255)
  return `\\alpha&H${a.toString(16).toUpperCase().padStart(2, '0')}&`
}

function dialogue(start: number, end: number, body: string): string {
  return `Dialogue: 0,${assTime(start)},${assTime(end)},Danmaku,,0,0,0,,${body}`
}

function buildDocument(width: number, height: number, fontSize: number, events: string[]): string {
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'Collisions: Normal',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Danmaku,Microsoft YaHei,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,1.2,0,7,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n')
}
