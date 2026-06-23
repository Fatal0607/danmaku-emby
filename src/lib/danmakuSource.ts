import type {
  DanmakuEpisode,
  DanmakuMatchInput,
  DanmakuProvider as ProviderId,
  DanmakuSeason,
  DanmakuTrack,
  ProviderConfig,
} from '@shared/types/danmaku'
import type { ProviderInfo } from '../../electron/main/danmaku/ProviderRegistry'
import { getApi, isElectron, unwrap } from './ipc'
import { mockDanmakuComments } from './mockData'

// Unified danmaku access for the renderer, mirroring `dataSource.ts`. The
// Electron implementation talks to the Main process over `window.api.danmaku`;
// the mock implementation backs the browser preview so the player UI stays
// exercisable without a server. `getDanmakuSource()` picks automatically.

export interface ManualFetchArgs {
  provider: ProviderId
  serverId: string
  embyItemId: string
  seasonId: string
  indexedId: string
}

export interface DanmakuSource {
  listProviders(): Promise<ProviderInfo[]>
  /** Persisted provider configs (name/enabled/order) for the settings page. */
  listConfigs(): Promise<ProviderConfig[]>
  setProviderEnabled(id: string, enabled: boolean): Promise<ProviderConfig[]>
  reorderProviders(orderedIds: string[]): Promise<ProviderConfig[]>
  autoMatch(input: DanmakuMatchInput): Promise<DanmakuTrack | null>
  /** Search every enabled provider and merge their seasons. */
  searchAll(keyword: string): Promise<DanmakuSeason[]>
  episodes(provider: ProviderId, seasonId: string): Promise<DanmakuEpisode[]>
  fetchManual(args: ManualFetchArgs): Promise<DanmakuTrack>
}

class ElectronDanmakuSource implements DanmakuSource {
  listProviders(): Promise<ProviderInfo[]> {
    return unwrap(getApi().danmaku.listProviders())
  }

  listConfigs(): Promise<ProviderConfig[]> {
    return unwrap(getApi().danmaku.listConfigs())
  }

  setProviderEnabled(id: string, enabled: boolean): Promise<ProviderConfig[]> {
    return unwrap(getApi().danmaku.setProviderEnabled(id, enabled))
  }

  reorderProviders(orderedIds: string[]): Promise<ProviderConfig[]> {
    return unwrap(getApi().danmaku.reorderProviders(orderedIds))
  }

  autoMatch(input: DanmakuMatchInput): Promise<DanmakuTrack | null> {
    return unwrap(getApi().danmaku.autoMatch(input))
  }

  async searchAll(keyword: string): Promise<DanmakuSeason[]> {
    if (!keyword.trim()) return []
    const providers = (await this.listProviders()).filter((p) => p.enabled)
    const results = await Promise.allSettled(
      providers.map((p) => unwrap(getApi().danmaku.search(p.id, keyword))),
    )
    // One failing provider must not blank the whole result set.
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  }

  episodes(provider: ProviderId, seasonId: string): Promise<DanmakuEpisode[]> {
    return unwrap(getApi().danmaku.episodes(provider, seasonId))
  }

  fetchManual(args: ManualFetchArgs): Promise<DanmakuTrack> {
    return unwrap(getApi().danmaku.fetchManual(args))
  }
}

const MOCK_TRACK: DanmakuTrack = {
  provider: 'dandanplay',
  providerConfigId: 'default',
  indexedId: 'mock-ep',
  seasonId: 'mock-season',
  comments: mockDanmakuComments,
  commentCount: mockDanmakuComments.length,
  lastChecked: Date.now(),
}

const MOCK_SEASONS: DanmakuSeason[] = [
  {
    provider: 'dandanplay',
    providerIds: { animeId: 1 },
    indexedId: 's-ddp-1',
    title: '星海彼端',
    type: '剧场版',
    episodeCount: 1,
    year: 2024,
  },
  {
    provider: 'bilibili',
    providerIds: { seasonId: 2 },
    indexedId: 's-bili-1',
    title: '星海彼端 剧场版',
    type: '番剧',
    episodeCount: 1,
    year: 2024,
  },
  {
    provider: 'dandanplay',
    providerIds: { animeId: 3 },
    indexedId: 's-ddp-2',
    title: 'Beyond the Star Sea',
    type: 'TV 动画',
    episodeCount: 12,
    year: 2023,
  },
  {
    provider: 'tencent',
    providerIds: { cid: 'mzc00200abcd' },
    indexedId: 's-tx-1',
    title: '星海彼端 电影版',
    type: '电影',
    episodeCount: 1,
    year: 2024,
  },
]

// Mutable so toggles/reorder persist across the preview session.
const mockConfigs: ProviderConfig[] = [
  { id: 'dandanplay', manifestId: 'dandanplay', name: '弹弹play', enabled: true, configValues: {}, sortOrder: 0 },
  { id: 'bilibili', manifestId: 'bilibili', name: '哔哩哔哩', enabled: true, configValues: {}, sortOrder: 1 },
  { id: 'tencent', manifestId: 'tencent', name: '腾讯视频', enabled: true, configValues: {}, sortOrder: 2 },
]

function sortedMockConfigs(): ProviderConfig[] {
  return [...mockConfigs].sort((a, b) => a.sortOrder - b.sortOrder)
}

class MockDanmakuSource implements DanmakuSource {
  async listProviders(): Promise<ProviderInfo[]> {
    return sortedMockConfigs().map((c) => ({
      id: c.manifestId,
      enabled: c.enabled,
      sortOrder: c.sortOrder,
    }))
  }

  async listConfigs(): Promise<ProviderConfig[]> {
    return sortedMockConfigs()
  }

  async setProviderEnabled(id: string, enabled: boolean): Promise<ProviderConfig[]> {
    const config = mockConfigs.find((c) => c.id === id)
    if (config) config.enabled = enabled
    return sortedMockConfigs()
  }

  async reorderProviders(orderedIds: string[]): Promise<ProviderConfig[]> {
    orderedIds.forEach((id, index) => {
      const config = mockConfigs.find((c) => c.id === id)
      if (config) config.sortOrder = index
    })
    return sortedMockConfigs()
  }

  async autoMatch(): Promise<DanmakuTrack | null> {
    return MOCK_TRACK
  }

  async searchAll(keyword: string): Promise<DanmakuSeason[]> {
    const enabled = new Set(mockConfigs.filter((c) => c.enabled).map((c) => c.manifestId))
    const pool = MOCK_SEASONS.filter((s) => enabled.has(s.provider))
    const term = keyword.trim()
    if (!term) return pool
    const matched = pool.filter((s) => s.title.includes(term))
    return matched.length ? matched : pool
  }

  async episodes(provider: ProviderId, seasonId: string): Promise<DanmakuEpisode[]> {
    const season = MOCK_SEASONS.find((s) => s.indexedId === seasonId)
    const count = season?.episodeCount ?? 1
    return Array.from({ length: count }, (_, i) => ({
      provider,
      providerIds: {},
      indexedId: `${seasonId}-ep-${i + 1}`,
      title: count === 1 ? '正片' : `第 ${i + 1} 话`,
      episodeNumber: i + 1,
    }))
  }

  async fetchManual(): Promise<DanmakuTrack> {
    return MOCK_TRACK
  }
}

let cached: DanmakuSource | null = null

export function getDanmakuSource(): DanmakuSource {
  if (!cached) cached = isElectron() ? new ElectronDanmakuSource() : new MockDanmakuSource()
  return cached
}
