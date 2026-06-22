import type { Server, MediaItem, MediaKind, Episode } from '@shared/types/domain'
import type { ServerInput, EmbyItemType } from '@shared/types/emby'
import { getApi, isElectron, unwrap } from './ipc'
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
    const page = await unwrap(
      getApi().emby.items({
        serverId,
        recursive: true,
        includeItemTypes: ['Movie', 'Episode'],
        filters: ['IsResumable'],
        sortBy: 'DatePlayed',
        sortOrder: 'Descending',
        limit: 12,
      }),
    )
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
