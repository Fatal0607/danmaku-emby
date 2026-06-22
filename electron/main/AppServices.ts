import { randomUUID } from 'node:crypto'
import type {
  EmbyItem,
  EmbyServer,
  EmbyView,
  ImageType,
  ItemsQuery,
  Page,
  PlaybackSource,
  ProgressReport,
  ServerInput,
} from '@shared/types/emby'
import { Store } from './store/Store'
import { SecretService } from './secret/SecretService'
import { EmbyService } from './emby/EmbyService'
import { HttpFetchLike } from './net/FetchLike'

// Composition root for the Main process. Builds the Store, SecretService, and
// EmbyService, then exposes high-level methods the IPC handlers call. Keeps the
// handlers thin (docs 01 §1.3).

export class AppServices {
  readonly store: Store
  readonly secrets: SecretService
  readonly emby: EmbyService
  readonly deviceId: string

  constructor(dbPath: string) {
    this.store = new Store(dbPath)
    this.secrets = new SecretService(this.store.meta)
    this.deviceId = this.store.meta.ensureDeviceId(() => randomUUID())
    this.emby = new EmbyService({
      fetcher: new HttpFetchLike(),
      deviceId: this.deviceId,
      getToken: (serverId) => this.secrets.getToken(serverId),
    })
  }

  // ---- Emby facade ----

  async addServer(input: ServerInput): Promise<EmbyServer> {
    const { server, token } = await this.emby.authenticate(input)
    this.secrets.setToken(server.id, token)
    this.store.servers.upsert(server)
    return server
  }

  listServers(): EmbyServer[] {
    return this.store.servers.list()
  }

  removeServer(serverId: string): void {
    this.secrets.removeToken(serverId)
    this.store.servers.remove(serverId)
  }

  getViews(serverId: string): Promise<EmbyView[]> {
    return this.emby.getViews(this.requireServer(serverId))
  }

  getItems(query: ItemsQuery): Promise<Page<EmbyItem>> {
    return this.emby.getItems(this.requireServer(query.serverId), query)
  }

  getItem(serverId: string, itemId: string): Promise<EmbyItem> {
    return this.emby.getItem(this.requireServer(serverId), itemId)
  }

  getEpisodes(serverId: string, seriesId: string): Promise<EmbyItem[]> {
    return this.emby.getEpisodes(this.requireServer(serverId), seriesId)
  }

  search(serverId: string, term: string): Promise<Page<EmbyItem>> {
    return this.emby.search(this.requireServer(serverId), term)
  }

  resolvePlayback(serverId: string, itemId: string, startTicks?: number): Promise<PlaybackSource> {
    return this.emby.resolvePlaybackSource(this.requireServer(serverId), itemId, startTicks)
  }

  reportProgress(report: ProgressReport): Promise<void> {
    return this.emby.reportProgress(this.requireServer(report.serverId), report)
  }

  imageUrl(serverId: string, itemId: string, type: ImageType, tag?: string): string {
    return this.emby.imageUrl(this.requireServer(serverId), itemId, type, tag)
  }

  private requireServer(serverId: string): EmbyServer {
    const server = this.store.servers.get(serverId)
    if (!server) throw new Error(`EMBY_INVALID_SERVER: unknown server ${serverId}`)
    this.store.servers.touch(serverId)
    return server
  }
}
