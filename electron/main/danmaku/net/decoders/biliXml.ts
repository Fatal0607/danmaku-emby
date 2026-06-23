import type { CommentEntity } from '@shared/types/danmaku'

// Decode bilibili danmaku XML (x/v1/dm/list.so) into canonical {p,m} comments
// (docs 04 §4.4). Each entry: <d p="time,mode,fontsize,color,timestamp,pool,
// userHash,dmid">text</d>. We keep time/mode/color/userHash and normalize mode
// to our convention (1 scroll, 4 bottom, 5 top).

const ENTRY_RE = /<d\s+p="([^"]+)"[^>]*>([\s\S]*?)<\/d>/g

export function parseBiliXml(xml: string): CommentEntity[] {
  const out: CommentEntity[] = []
  let match: RegExpExecArray | null
  ENTRY_RE.lastIndex = 0
  while ((match = ENTRY_RE.exec(xml)) !== null) {
    const fields = match[1].split(',')
    if (fields.length < 4) continue
    const time = fields[0]
    const mode = normalizeMode(fields[1])
    const color = fields[3]
    const userHash = fields[6] ?? ''
    const text = decodeXmlEntities(match[2])
    if (!text) continue
    out.push({ p: `${time},${mode},${color},${userHash}`, m: text })
  }
  return out
}

/** bilibili modes: 1-3 scroll, 4 bottom, 5 top, 6 reverse → our 1/4/5. */
function normalizeMode(raw: string): 1 | 4 | 5 {
  switch (Number(raw)) {
    case 4:
      return 4
    case 5:
      return 5
    default:
      return 1
  }
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
}

export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;|&#39;/g, (m) => ENTITIES[m] ?? m)
    .trim()
}
