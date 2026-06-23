import { describe, expect, test } from 'vitest'
import type { EmbyView } from '@shared/types/emby'
import { buildHomeSectionQuery, buildViewSectionQuery, toMediaSection } from '@/lib/homeSections'

describe('home section helpers', () => {
  test('builds an item query scoped to an Emby home view', () => {
    const view: EmbyView = { id: 'view-movies', name: '电影库', collectionType: 'movies' }

    expect(buildHomeSectionQuery('server-1', view)).toMatchObject({
      serverId: 'server-1',
      parentId: 'view-movies',
      recursive: true,
      includeItemTypes: ['Movie', 'Video'],
      sortBy: 'DateCreated',
      sortOrder: 'Descending',
      limit: 20,
    })
  })

  test('builds paginated full-view queries for a complete Emby view page', () => {
    const view: EmbyView = { id: 'view-shows', name: '剧集库', collectionType: 'tvshows' }

    expect(buildViewSectionQuery('server-1', view, 200, 100)).toMatchObject({
      serverId: 'server-1',
      parentId: 'view-shows',
      recursive: true,
      includeItemTypes: ['Series'],
      sortBy: 'DateCreated',
      sortOrder: 'Descending',
      startIndex: 200,
      limit: 100,
    })
  })

  test('preserves the Emby view title and items in the rendered section model', () => {
    const view: EmbyView = { id: 'view-anime', name: '动漫', collectionType: 'tvshows' }
    const section = toMediaSection(view, [])

    expect(section).toEqual({
      id: 'view-anime',
      title: '动漫',
      collectionType: 'tvshows',
      items: [],
    })
  })
})
