import { describe, expect, test } from 'vitest'
import type { MediaItem } from '@shared/types/domain'
import { formatMediaSubtitle } from '@/lib/mediaText'

const baseItem: MediaItem = {
  id: 'item-1',
  title: '测试条目',
  kind: 'movie',
  year: 0,
  genres: [],
  poster: ['#000', '#111'],
  overview: '',
  danmaku: { status: 'unmatched' },
}

describe('formatMediaSubtitle', () => {
  test('uses the episode label when present', () => {
    expect(formatMediaSubtitle({ ...baseItem, episodeLabel: '第 1 集' })).toBe('第 1 集')
  })

  test('omits missing year and genre instead of rendering raw empty values', () => {
    expect(formatMediaSubtitle(baseItem)).toBe('影片')
  })
})
