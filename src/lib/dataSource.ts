import type { Server, MediaItem, MediaKind, Episode, MediaSection } from '@shared/types/domain'
import type { ServerInput, EmbyItemType, EmbyView } from '@shared/types/emby'
import { getApi, isElectron, unwrap } from './ipc'
import { buildHomeSectionQuery, buildViewSectionQuery, toMediaSection } from './homeSections'
import {
  embyEpisodeToView,
  embyItemToMedia,
  embyServerToView,
} from './mappers'
import { servers as mockServers, catalog, episodes as mockEpisodes } from './mockData'

// Unified data access for the renderer. The Emby implementation talks to the
// Main process over IPC; the mock implementation backs the browser preview.
// `getDataSource()` picks automatically.

export interface DataSource {
  listServers(): Promise<Server[]>
  addServer(input: ServerInput): Promise<Server>
  removeServer(serverId: string): Promise<void>
  continueWatching(serverId: string): Promise<MediaItem[]>
  recentlyAdded(serverId: string): Promise<MediaItem[]>
  homeSections(serverId: string): Promise<MediaSection[]>
  viewSection(serverId: string, viewId: string): Promise<MediaSection>
  library(serverId: string, kind: MediaKind): Promise<MediaItem[]>
  item(serverId: string, itemId: string): Promise<MediaItem>
  episodes(serverId: string, seriesId: string): Promise<Episode[]>
  search(serverId: string, term: string): Promise<MediaItem[]>
}

const KIND_TO_TYPES: Record<MediaKind, EmbyItemType[]> = {
  movie: ['Movie'],
  series: ['Series'],
  anime: ['Series'],
}

const MOCK_VIEWS: EmbyView[] = [
  { id: 'mock-movies', name: '电影', collectionType: 'movies' },
  { id: 'mock-series', name: '剧集', collectionType: 'tvshows' },
  { id: 'mock-anime', name: '动漫', collectionType: 'tvshows' },
]

function mockItemsForView(viewId: string): MediaItem[] {
  return catalog.filter((item) =>
    viewId === 'mock-movies'
      ? item.kind === 'movie'
      : viewId === 'mock-anime'
        ? item.kind === 'anime'
        : item.kind === 'series',
  )
}

class EmbyDataSource implements DataSource {
  /** Cache server base URLs so item mapping can build image URLs. */
  private baseUrls = new Map<string, string>()

  private async baseUrl(serverId: string): Promise<string | undefined> {
    if (this.baseUrls.has(serverId)) return this.baseUrls.get(serverId)
    await this.listServers()
    return this.baseUrls.get(serverId)
  }

  async listServers(): Promise<Server[]> {
    const list = await unwrap(getApi().emby.listServers())
    for (const s of list) this.baseUrls.set(s.id, s.baseUrl)
    return list.map(embyServerToView)
  }

  async addServer(input: ServerInput): Promise<Server> {
    const server = await unwrap(getApi().emby.addServer(input))
    this.baseUrls.set(server.id, server.baseUrl)
    return embyServerToView(server)
  }

  removeServer(serverId: string): Promise<void> {
    return unwrap(getApi().emby.removeServer(serverId))
  }

  async continueWatching(serverId: string): Promise<MediaItem[]> {
    const base = await this.baseUrl(serverId)
    const page = await unwrap(getApi().emby.resumeItems(serverId, 12))
    return page.items.map((i) => embyItemToMedia(i, base))
  }

  async recentlyAdded(serverId: string): Promise<MediaItem[]> {
    const base = await this.baseUrl(serverId)
    const page = await unwrap(
      getApi().emby.items({
        serverId,
        recursive: true,
        includeItemTypes: ['Movie', 'Series'],
        sortBy: 'DateCreated',
        sortOrder: 'Descending',
        limit: 20,
      }),
    )
    return page.items.map((i) => embyItemToMedia(i, base))
  }

  async homeSections(serverId: string): Promise<MediaSection[]> {
    const base = await this.baseUrl(serverId)
    const views = await unwrap(getApi().emby.views(serverId))
    const sections = await Promise.all(
      views.map(async (view) => {
        const page = await unwrap(getApi().emby.items(buildHomeSectionQuery(serverId, view)))
        const items = page.items.map((i) => embyItemToMedia(i, base))
        return toMediaSection(view, items)
      }),
    )
    return sections.filter((section) => section.items.length > 0)
  }

  async viewSection(serverId: string, viewId: string): Promise<MediaSection> {
    const base = await this.baseUrl(serverId)
    const views = await unwrap(getApi().emby.views(serverId))
    const view = views.find((v) => v.id === viewId)
    if (!view) throw new Error('未找到这个 Emby 资源库')

    const items: MediaItem[] = []
    let startIndex = 0
    let total = Number.POSITIVE_INFINITY

    while (items.length < total) {
      const page = await unwrap(
        getApi().emby.items(buildViewSectionQuery(serverId, view, startIndex)),
      )
      total = page.total
      if (page.items.length === 0) break
      items.push(...page.items.map((i) => embyItemToMedia(i, base)))
      startIndex += page.items.length
    }

    return toMediaSection(view, items)
  }

  async library(serverId: string, kind: MediaKind): Promise<MediaItem[]> {
    const base = await this.baseUrl(serverId)
    const page = await unwrap(
      getApi().emby.items({
        serverId,
        recursive: true,
        includeItemTypes: KIND_TO_TYPES[kind],
        sortBy: 'SortName',
        sortOrder: 'Ascending',
        limit: 60,
      }),
    )
    return page.items.map((i) => embyItemToMedia(i, base))
  }

  async item(serverId: string, itemId: string): Promise<MediaItem> {
    const base = await this.baseUrl(serverId)
    const item = await unwrap(getApi().emby.item(serverId, itemId))
    return embyItemToMedia(item, base)
  }

  async episodes(serverId: string, seriesId: string): Promise<Episode[]> {
    const list = await unwrap(getApi().emby.episodes(serverId, seriesId))
    return list.map(embyEpisodeToView)
  }

  async search(serverId: string, term: string): Promise<MediaItem[]> {
    const base = await this.baseUrl(serverId)
    const page = await unwrap(getApi().emby.search(serverId, term))
    return page.items.map((i) => embyItemToMedia(i, base))
  }
}

class MockDataSource implements DataSource {
  async listServers(): Promise<Server[]> {
    return mockServers
  }
  async addServer(): Promise<Server> {
    return mockServers[0]
  }
  async removeServer(): Promise<void> {
    /* no-op in preview */
  }
  async continueWatching(): Promise<MediaItem[]> {
    return catalog.filter((c) => c.progress != null)
  }
  async recentlyAdded(): Promise<MediaItem[]> {
    return catalog
  }
  async homeSections(): Promise<MediaSection[]> {
    return MOCK_VIEWS.map((view) => toMediaSection(view, mockItemsForView(view.id)))
  }
  async viewSection(_serverId: string, viewId: string): Promise<MediaSection> {
    const view = MOCK_VIEWS.find((v) => v.id === viewId)
    if (!view) throw new Error('未找到这个 Emby 资源库')
    return toMediaSection(view, mockItemsForView(view.id))
  }
  async library(_serverId: string, kind: MediaKind): Promise<MediaItem[]> {
    const base = catalog.filter((c) => c.kind === kind)
    return base.length ? [...base, ...catalog, ...catalog].slice(0, 18) : catalog
  }
  async item(_serverId: string, itemId: string): Promise<MediaItem> {
    return catalog.find((c) => c.id === itemId) ?? catalog[0]
  }
  async episodes(): Promise<Episode[]> {
    return mockEpisodes
  }
  async search(_serverId: string, term: string): Promise<MediaItem[]> {
    if (!term) return catalog
    return catalog.filter(
      (c) =>
        c.title.includes(term) ||
        c.genres.some((g) => g.includes(term)) ||
        (c.quality?.includes(term) ?? false),
    )
  }
}

let cached: DataSource | null = null

export function getDataSource(): DataSource {
  if (!cached) cached = isElectron() ? new EmbyDataSource() : new MockDataSource()
  return cached
}
