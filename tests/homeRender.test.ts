import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { describe, expect, test } from 'vitest'
import type { MediaItem, MediaSection, Server } from '@shared/types/domain'
import { Home } from '@/features/home/Home'
import { qk } from '@/lib/queries'

const server: Server = {
  id: 'server-1',
  name: '测试服务器',
  address: 'emby.local',
  initial: '测',
  accentFrom: '#3a82f7',
  accentTo: '#6a5bff',
  status: 'connected',
}

const baseItem: MediaItem = {
  id: 'item-1',
  title: '测试影片',
  kind: 'movie',
  year: 2024,
  genres: ['剧情'],
  poster: ['#000', '#111'],
  overview: '',
  danmaku: { status: 'unmatched' },
}

const dynamicSection: MediaSection = {
  id: 'view-1',
  title: '动画电影',
  collectionType: 'movies',
  items: [baseItem],
}

function renderHome(): string {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  qc.setQueryData(qk.servers, [server])
  qc.setQueryData(qk.continueWatching(server.id), [baseItem])
  qc.setQueryData(qk.recentlyAdded(server.id), [{ ...baseItem, id: 'item-2' }])
  qc.setQueryData(qk.homeSections(server.id), [dynamicSection])

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(StaticRouter, { location: '/' }, createElement(Home)),
    ),
  )
}

describe('Home', () => {
  test('only renders view-more controls for dynamic Emby view sections', () => {
    const html = renderHome()

    expect(html).not.toContain('查看全部')
    expect(html.match(/查看更多/g)).toHaveLength(1)
    expect(html).toContain('动画电影')
  })
})
