import { describe, expect, test } from 'vitest'
import type {
  CommentEntity,
  DanmakuEpisode,
  DanmakuProvider,
  DanmakuSeason,
  ProviderConfig,
} from '@shared/types/danmaku'
import { openDatabase } from '@/../electron/main/store/db'
import { ProviderConfigRepo } from '@/../electron/main/store/repositories/ProviderConfigRepo'
import { ProviderRegistry } from '@/../electron/main/danmaku/ProviderRegistry'
import type { DanmakuSourceProvider } from '@/../electron/main/danmaku/providers/DanmakuProvider'

const DEFAULTS: ProviderConfig[] = [
  { id: 'dandanplay', manifestId: 'dandanplay', name: '弹弹play', enabled: true, configValues: {}, sortOrder: 0 },
  { id: 'bilibili', manifestId: 'bilibili', name: '哔哩哔哩', enabled: true, configValues: {}, sortOrder: 1 },
  { id: 'tencent', manifestId: 'tencent', name: '腾讯视频', enabled: true, configValues: {}, sortOrder: 2 },
]

function repo(): ProviderConfigRepo {
  return new ProviderConfigRepo(openDatabase(':memory:'))
}

describe('ProviderConfigRepo', () => {
  test('seedDefaults inserts built-ins ordered by sortOrder', () => {
    const r = repo()
    r.seedDefaults(DEFAULTS)
    expect(r.list().map((c) => c.id)).toEqual(['dandanplay', 'bilibili', 'tencent'])
  })

  test('seedDefaults is idempotent and preserves user overrides', () => {
    const r = repo()
    r.seedDefaults(DEFAULTS)
    r.setEnabled('bilibili', false)
    r.setSortOrder('tencent', -1)

    // Re-seeding (e.g. on next launch) must not clobber the overrides.
    r.seedDefaults(DEFAULTS)
    const list = r.list()
    expect(list).toHaveLength(3)
    expect(list[0].id).toBe('tencent') // moved to the front
    expect(r.get('bilibili')?.enabled).toBe(false)
  })

  test('roundtrips enabled flag and configValues', () => {
    const r = repo()
    r.upsert({
      id: 'x',
      manifestId: 'dandanplay',
      name: 'X',
      enabled: false,
      configValues: { proxy: 'https://p' },
      sortOrder: 5,
    })
    const got = r.get('x')
    expect(got?.enabled).toBe(false)
    expect(got?.configValues).toEqual({ proxy: 'https://p' })
    expect(got?.sortOrder).toBe(5)
  })

  test('seedDefaults adds newly shipped built-ins without touching the rest', () => {
    const r = repo()
    r.seedDefaults(DEFAULTS.slice(0, 2)) // older build: only ddp + bilibili
    r.setEnabled('dandanplay', false)
    r.seedDefaults(DEFAULTS) // newer build introduces tencent
    expect(r.list().map((c) => c.id)).toContain('tencent')
    expect(r.get('dandanplay')?.enabled).toBe(false)
  })
})

function stubProvider(id: DanmakuProvider): DanmakuSourceProvider {
  return {
    id,
    async match() {
      return null
    },
    async search(): Promise<DanmakuSeason[]> {
      return []
    },
    async episodes(): Promise<DanmakuEpisode[]> {
      return []
    },
    async getComments(): Promise<CommentEntity[]> {
      return []
    },
  }
}

describe('ProviderRegistry mutation', () => {
  function registry(): ProviderRegistry {
    return new ProviderRegistry([
      { provider: stubProvider('dandanplay'), enabled: true, sortOrder: 0 },
      { provider: stubProvider('bilibili'), enabled: true, sortOrder: 1 },
      { provider: stubProvider('tencent'), enabled: true, sortOrder: 2 },
    ])
  }

  test('setEnabled hides a provider from get and priority order', () => {
    const reg = registry()
    reg.setEnabled('bilibili', false)
    expect(reg.get('bilibili')).toBeUndefined()
    expect(reg.enabledByPriority().map((p) => p.id)).toEqual(['dandanplay', 'tencent'])
    expect(reg.list().find((e) => e.id === 'bilibili')?.enabled).toBe(false)
  })

  test('setSortOrder re-sorts priority', () => {
    const reg = registry()
    reg.setSortOrder('tencent', -1)
    expect(reg.enabledByPriority().map((p) => p.id)).toEqual([
      'tencent',
      'dandanplay',
      'bilibili',
    ])
  })
})
