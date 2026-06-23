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
  ProviderConfig,
} from '@shared/types/danmaku'
import { Store } from './store/Store'
import { SecretService } from './secret/SecretService'
import { EmbyService } from './emby/EmbyService'
import { HttpFetchLike } from './net/FetchLike'
import { DanmakuService } from './danmaku/DanmakuService'
import {
  ProviderRegistry,
  type ProviderInfo,
  type RegisteredProvider,
} from './danmaku/ProviderRegistry'
import {
  DandanplayProvider,
  type DandanplayConfig,
} from './danmaku/providers/dandanplay/DandanplayProvider'
import { BilibiliProvider } from './danmaku/providers/bilibili/BilibiliProvider'
import { TencentProvider } from './danmaku/providers/tencent/TencentProvider'
import type { DanmakuSourceProvider } from './danmaku/providers/DanmakuProvider'
import { DEFAULT_PROVIDER_CONFIGS } from './danmaku/providers/defaults'
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
  private readonly registry: ProviderRegistry

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

    // Provider instances keyed by manifest; the registry's enabled/order come
    // from persisted provider_configs (seeded with the built-ins on first run).
    const ddpConfig = this.store.preferences.get<DandanplayConfig>('dandanplayConfig', {})
    const providerByManifest: Partial<Record<ProviderId, DanmakuSourceProvider>> = {
      dandanplay: new DandanplayProvider(fetcher, ddpConfig),
      bilibili: new BilibiliProvider(fetcher),
      tencent: new TencentProvider(fetcher),
    }

    this.store.providerConfigs.seedDefaults(DEFAULT_PROVIDER_CONFIGS)
    const entries = this.store.providerConfigs
      .list()
      .map((c): RegisteredProvider | null => {
        const provider = providerByManifest[c.manifestId]
        return provider ? { provider, enabled: c.enabled, sortOrder: c.sortOrder } : null
      })
      .filter((e): e is RegisteredProvider => e !== null)

    this.registry = new ProviderRegistry(entries)
    this.danmaku = new DanmakuService(
      this.registry,
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

  /** Persisted provider configs for the settings page (name/enabled/order). */
  danmakuListProviderConfigs(): ProviderConfig[] {
    return this.store.providerConfigs.list()
  }

  /** Toggle a provider, persisting and reflecting it in the live registry. */
  danmakuSetProviderEnabled(id: string, enabled: boolean): ProviderConfig[] {
    this.store.providerConfigs.setEnabled(id, enabled)
    this.registry.setEnabled(id as ProviderId, enabled)
    return this.store.providerConfigs.list()
  }

  /** Reorder providers by an explicit id list; index becomes the sort order. */
  danmakuReorderProviders(orderedIds: string[]): ProviderConfig[] {
    orderedIds.forEach((id, index) => {
      this.store.providerConfigs.setSortOrder(id, index)
      this.registry.setSortOrder(id as ProviderId, index)
    })
    return this.store.providerConfigs.list()
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
