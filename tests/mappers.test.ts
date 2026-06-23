import { describe, expect, test } from 'vitest'
import type { EmbyItem } from '@shared/types/emby'
import { embyItemToMedia } from '@/lib/mappers'

describe('embyItemToMedia', () => {
  test('uses the series name as the display title for episodes', () => {
    const item: EmbyItem = {
      id: 'episode-1',
      serverId: 'server',
      name: '风起天南1：七玄门',
      type: 'Episode',
      seriesId: 'series-1',
      seriesName: '凡人修仙传',
      indexNumber: 1,
      parentIndexNumber: 1,
      productionYear: 2020,
      playedPercentage: 0.2,
      runTimeTicks: 20 * 60 * 10_000_000,
      playbackPositionTicks: 4 * 60 * 10_000_000,
    }

    const media = embyItemToMedia(item)

    expect(media.title).toBe('凡人修仙传')
    expect(media.originalTitle).toBe('风起天南1：七玄门')
    expect(media.episodeLabel).toBe('第 1 集 · 风起天南1：七玄门')
    expect(media).toMatchObject({
      seriesId: 'series-1',
      seasonNumber: 1,
      episodeNumber: 1,
    })
  })
})
