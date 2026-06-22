import { describe, expect, test } from 'vitest'
import type { CommentEntity } from '@shared/types/danmaku'
import { toAss } from '@/../electron/main/danmaku/render/toAss'
import {
  assTime,
  escapeAssText,
  parseComment,
  rgbToAssBgr,
} from '@/../electron/main/danmaku/render/parseComment'

describe('parseComment', () => {
  test('parses time/mode/color from p', () => {
    const c = parseComment({ p: '12.5,1,16777215,abc', m: 'hi' })
    expect(c).toEqual({ timeSec: 12.5, mode: 1, color: 16777215, text: 'hi' })
  })

  test('maps unknown modes to scroll (1)', () => {
    expect(parseComment({ p: '0,7,0', m: 'x' })?.mode).toBe(1)
    expect(parseComment({ p: '0,5,0', m: 'x' })?.mode).toBe(5)
    expect(parseComment({ p: '0,4,0', m: 'x' })?.mode).toBe(4)
  })

  test('rejects malformed rows', () => {
    expect(parseComment({ p: 'nope', m: 'x' })).toBeNull()
    expect(parseComment({ p: '-1,1,0', m: 'x' })).toBeNull()
  })
})

describe('rgbToAssBgr', () => {
  test('converts decimal RGB to ASS BGR hex', () => {
    expect(rgbToAssBgr(0xffffff)).toBe('&HFFFFFF&')
    expect(rgbToAssBgr(0xff0000)).toBe('&H0000FF&') // red → BGR
    expect(rgbToAssBgr(0x0000ff)).toBe('&HFF0000&') // blue → BGR
  })
})

describe('assTime', () => {
  test('formats H:MM:SS.cc', () => {
    expect(assTime(0)).toBe('0:00:00.00')
    expect(assTime(3661.5)).toBe('1:01:01.50')
  })
})

describe('escapeAssText', () => {
  test('neutralizes braces and newlines', () => {
    expect(escapeAssText('a{b}c')).toBe('a(b)c')
    expect(escapeAssText('a\nb')).toBe('a b')
  })
})

describe('toAss', () => {
  const comments: CommentEntity[] = [
    { p: '1,1,16777215,u', m: '前方高能' },
    { p: '2,5,16711680,u', m: '顶部弹幕' },
    { p: '3,4,255,u', m: '底部弹幕' },
  ]

  test('produces a valid ASS document with header + events', () => {
    const ass = toAss(comments, { width: 1920, height: 1080 })
    expect(ass).toContain('[Script Info]')
    expect(ass).toContain('PlayResX: 1920')
    expect(ass).toContain('[V4+ Styles]')
    expect(ass).toContain('[Events]')
    expect(ass.match(/^Dialogue:/gm)?.length).toBe(3)
  })

  test('scroll comments use \\move, fixed use \\an8/\\an2', () => {
    const ass = toAss(comments)
    expect(ass).toMatch(/\\move\(/)
    expect(ass).toMatch(/\\an8/)
    expect(ass).toMatch(/\\an2/)
  })

  test('blockKeywords filter matching comments', () => {
    const ass = toAss(comments, { prefs: { blockKeywords: ['高能'] } })
    expect(ass).not.toContain('前方高能')
    expect(ass.match(/^Dialogue:/gm)?.length).toBe(2)
  })

  test('hideMode drops a whole comment kind', () => {
    const ass = toAss(comments, { prefs: { hideMode: ['scroll'] } })
    expect(ass).not.toContain('前方高能')
    expect(ass).toContain('顶部弹幕')
  })

  test('opacity maps to an alpha override tag', () => {
    const ass = toAss([comments[0]], { prefs: { opacity: 0.5 } })
    expect(ass).toMatch(/\\alpha&H80&/i)
  })

  test('area=top reduces available lanes vs full', () => {
    // Saturate one instant with many scroll comments; fewer lanes → fewer kept.
    const many: CommentEntity[] = Array.from({ length: 60 }, (_, i) => ({
      p: `0,1,16777215,u${i}`,
      m: `弹幕${i}`,
    }))
    const full = toAss(many, { height: 1080, prefs: { area: 'full' } }).match(/^Dialogue:/gm)!
      .length
    const top = toAss(many, { height: 1080, prefs: { area: 'top' } }).match(/^Dialogue:/gm)!
      .length
    expect(top).toBeLessThan(full)
  })
})
