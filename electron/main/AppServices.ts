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
import type {
  CommentEntity,
  DanmakuEpisode,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
  DanmakuTrack,
} from '@shared/types/danmaku'
import { Store } from './store/Store'
import { SecretService } from './secret/SecretService'
import { EmbyService } from './emby/EmbyService'
import { HttpFetchLike } from './net/FetchLike'
import { DanmakuService } from './danmaku/DanmakuService'
import { ProviderRegistry, type ProviderInfo } from './danmaku/ProviderRegistry'
import {
  DandanplayProvider,
  type DandanplayConfig,
} from './danmaku/providers/dandanplay/DandanplayProvider'
import { BilibiliProvider } from './danmaku/providers/bilibili/BilibiliProvider'
import type { AssOptions } from './danmaku/render/toAss'

// Composition root for the Main process. Builds the Store, SecretService, and
// EmbyService, then exposes high-level methods the IPC handlers call. Keeps the
// handlers thin (docs 01 §1.3).

export class AppServices {
  readonly store: Store
  readonly secrets: SecretService
  readonly emby: EmbyService
  readonly danmaku: DanmakuService
  readonly deviceId: string

  constructor(dbPath: string) {
    this.store = new Store(dbPath)
    this.secrets = new SecretService(this.store.meta)
    this.deviceId = this.store.meta.ensureDeviceId(() => randomUUID())

    const fetcher = new HttpFetchLike()
    this.emby = new EmbyService({
      fetcher,
      deviceId: this.deviceId,
      getToken: (serverId) => this.secrets.getToken(serverId),
    })

    const ddpConfig = this.store.preferences.get<DandanplayConfig>('dandanplayConfig', {})
    const registry = new ProviderRegistry([
      { provider: new DandanplayProvider(fetcher, ddpConfig), enabled: true, sortOrder: 0 },
      { provider: new BilibiliProvider(fetcher), enabled: true, sortOrder: 1 },
    ])
    this.danmaku = new DanmakuService(
      registry,
      this.store.danmakuMap,
      this.store.danmakuCache,
    )
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

  // ---- Danmaku facade ----

  danmakuListProviders(): ProviderInfo[] {
    return this.danmaku.listProviders()
  }

  danmakuAutoMatch(input: DanmakuMatchInput): Promise<DanmakuTrack | null> {
    return this.danmaku.autoMatchAndFetch(input)
  }

  danmakuSearch(provider: ProviderId, keyword: string): Promise<DanmakuSeason[]> {
    return this.danmaku.search(provider, keyword)
  }

  danmakuEpisodes(provider: ProviderId, seasonId: string): Promise<DanmakuEpisode[]> {
    return this.danmaku.episodes(provider, seasonId)
  }

  danmakuFetchManual(args: {
    provider: ProviderId
    serverId: string
    embyItemId: string
    seasonId: string
    indexedId: string
  }): Promise<DanmakuTrack> {
    return this.danmaku.fetchManual(args)
  }

  danmakuToAss(comments: CommentEntity[], opts: Partial<AssOptions>): string {
    return this.danmaku.toAss(comments, opts)
  }

  private requireServer(serverId: string): EmbyServer {
    const server = this.store.servers.get(serverId)
    if (!server) throw new Error(`EMBY_INVALID_SERVER: unknown server ${serverId}`)
    this.store.servers.touch(serverId)
    return server
  }
}
