import { describe, expect, test, vi } from 'vitest'
import type { FetchLike, FetchLikeRequest, FetchLikeResponse } from '@/../electron/main/net/FetchLike'
import { signRequest } from '@/../electron/main/danmaku/providers/dandanplay/sign'
import {
  animeToSeason,
  commentsToEntities,
  matchToEpisode,
  parseEpisodeNumber,
} from '@/../electron/main/danmaku/providers/dandanplay/mapping'
import { DandanplayProvider } from '@/../electron/main/danmaku/providers/dandanplay/DandanplayProvider'
import { extrapolateEpisodeId, MatchService } from '@/../electron/main/danmaku/MatchService'
import { DanmakuService } from '@/../electron/main/danmaku/DanmakuService'
import { ProviderRegistry } from '@/../electron/main/danmaku/ProviderRegistry'
import type { DanmakuSourceProvider } from '@/../electron/main/danmaku/providers/DanmakuProvider'
import type { DanmakuMapRepo, DanmakuCacheRepo } from '@/../electron/main/store/repositories/DanmakuRepos'
import type { DanmakuMapping, DanmakuTrack } from '@shared/types/danmaku'

function fakeFetcher(routes: Array<[RegExp, Partial<FetchLikeResponse>]>): FetchLike {
  return {
    request: vi.fn(async (req: FetchLikeRequest) => {
      const hit = routes.find(([re]) => re.test(req.url))
      return { status: 200, ok: true, headers: {}, data: {}, ...(hit?.[1] ?? {}) } as FetchLikeResponse
    }),
  }
}

/** Single-provider registry for orchestration tests. */
function registryOf(provider: DanmakuSourceProvider): ProviderRegistry {
  return new ProviderRegistry([{ provider, enabled: true, sortOrder: 0 }])
}

describe('signRequest', () => {
  test('is deterministic and base64-shaped', () => {
    const a = signRequest({ appId: 'app', appSecret: 'secret' }, '/api/v2/match', 1700000000)
    const b = signRequest({ appId: 'app', appSecret: 'secret' }, '/api/v2/match', 1700000000)
    expect(a['X-Signature']).toBe(b['X-Signature'])
    expect(a['X-Signature']).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(a['X-AppId']).toBe('app')
    expect(a['X-Timestamp']).toBe('1700000000')
  })

  test('changes with path or secret', () => {
    const base = signRequest({ appId: 'a', appSecret: 's' }, '/p1', 1)['X-Signature']
    expect(signRequest({ appId: 'a', appSecret: 's' }, '/p2', 1)['X-Signature']).not.toBe(base)
    expect(signRequest({ appId: 'a', appSecret: 'x' }, '/p1', 1)['X-Signature']).not.toBe(base)
  })
})

describe('dandanplay mapping', () => {
  test('matchToEpisode keeps episodeId as indexedId', () => {
    const ep = matchToEpisode({
      episodeId: 123456,
      animeId: 789,
      animeTitle: '星海彼端',
      episodeTitle: '第7话',
    })
    expect(ep.indexedId).toBe('123456')
    expect(ep.providerIds.animeId).toBe(789)
    expect(ep.episodeNumber).toBe(7)
  })

  test('animeToSeason extracts year from startDate', () => {
    const s = animeToSeason({ animeId: 1, animeTitle: 'X', startDate: '2024-01-05', episodeCount: 12 })
    expect(s.year).toBe(2024)
    expect(s.episodeCount).toBe(12)
  })

  test('commentsToEntities preserves canonical {p,m}', () => {
    const out = commentsToEntities([
      { cid: 1, p: '12.5,1,16777215,u', m: 'hi' },
      { cid: 2, p: '3,5,255,u', m: 'top' },
    ])
    expect(out).toEqual([
      { p: '12.5,1,16777215,u', m: 'hi' },
      { p: '3,5,255,u', m: 'top' },
    ])
  })

  test('parseEpisodeNumber handles 第N话 and leading digits', () => {
    expect(parseEpisodeNumber('第3话')).toBe(3)
    expect(parseEpisodeNumber('12. Title')).toBe(12)
    expect(parseEpisodeNumber('SP 特别篇')).toBeUndefined()
  })
})

describe('DandanplayProvider', () => {
  test('match returns the first candidate, stripping the file extension', async () => {
    const fetcher = fakeFetcher([
      [
        /\/match/,
        {
          data: {
            isMatched: true,
            matches: [{ episodeId: 555, animeId: 99, animeTitle: 'A', episodeTitle: '第1话' }],
          },
        },
      ],
    ])
    const provider = new DandanplayProvider(fetcher)
    const ep = await provider.match({
      embyItemId: 'e1',
      serverId: 's1',
      fileName: 'A - S01E01 - 2160p.mkv',
    })
    expect(ep?.indexedId).toBe('555')
    const call = (fetcher.request as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(JSON.parse(call.body).fileName).toBe('A - S01E01 - 2160p')
  })

  test('match returns null when unmatched', async () => {
    const fetcher = fakeFetcher([[/\/match/, { data: { isMatched: false, matches: [] } }]])
    expect(await new DandanplayProvider(fetcher).match({ embyItemId: 'e', serverId: 's', fileName: 'x.mkv' })).toBeNull()
  })

  test('maps 429 to DM_RATE_LIMITED', async () => {
    const fetcher = fakeFetcher([[/\/comment\//, { status: 429, ok: false, data: {} }]])
    await expect(new DandanplayProvider(fetcher).getComments('1')).rejects.toMatchObject({
      code: 'DM_RATE_LIMITED',
    })
  })

  test('signs requests when credentials are configured', async () => {
    const fetcher = fakeFetcher([[/\/search/, { data: { animes: [] } }]])
    const provider = new DandanplayProvider(fetcher, { credentials: { appId: 'a', appSecret: 's' } })
    await provider.search('test')
    const headers = (fetcher.request as ReturnType<typeof vi.fn>).mock.calls[0][0].headers
    expect(headers['X-AppId']).toBe('a')
    expect(headers['X-Signature']).toBeTruthy()
  })
})

describe('extrapolateEpisodeId', () => {
  test('offsets the base id by the episode-number delta', () => {
    expect(extrapolateEpisodeId(1000, 1, 5)).toBe(1004)
    expect(extrapolateEpisodeId(1000, 3, 1)).toBe(998)
  })
})

// In-memory fakes for the repos so service orchestration tests stay unit-level.
class FakeMapRepo implements Pick<DanmakuMapRepo, 'get' | 'put' | 'bySeries'> {
  private store = new Map<string, DanmakuMapping>()
  private key = (s: string, i: string) => `${s}:${i}`
  get(serverId: string, embyItemId: string) {
    return this.store.get(this.key(serverId, embyItemId)) ?? null
  }
  put(m: DanmakuMapping) {
    const existing = this.get(m.serverId, m.embyItemId)
    if (existing?.source === 'manual' && m.source === 'auto') return
    this.store.set(this.key(m.serverId, m.embyItemId), m)
  }
  bySeries() {
    return []
  }
}

class FakeCacheRepo implements Pick<DanmakuCacheRepo, 'find' | 'upsert' | 'pruneOlderThan'> {
  private store = new Map<string, DanmakuTrack>()
  private key = (p: string, s: string, i: string) => `${p}:${s}:${i}`
  find(provider: string, seasonId: string, indexedId: string) {
    return this.store.get(this.key(provider, seasonId, indexedId)) ?? null
  }
  upsert(track: DanmakuTrack) {
    this.store.set(this.key(track.provider, track.seasonId, track.indexedId), track)
  }
  pruneOlderThan() {
    return 0
  }
}

describe('MatchService', () => {
  test('remembers auto matches and serves them from memory', async () => {
    const fetcher = fakeFetcher([
      [/\/match/, { data: { isMatched: true, matches: [{ episodeId: 7, animeId: 3, animeTitle: 'A', episodeTitle: '第1话' }] } }],
    ])
    const map = new FakeMapRepo()
    const svc = new MatchService(registryOf(new DandanplayProvider(fetcher)), map as unknown as DanmakuMapRepo)
    const first = await svc.autoMatch({ embyItemId: 'e1', serverId: 's1', fileName: 'a.mkv' })
    expect(first?.indexedId).toBe('7')
    expect(first?.source).toBe('auto')
    // Second call hits memory — provider is not queried again.
    await svc.autoMatch({ embyItemId: 'e1', serverId: 's1', fileName: 'a.mkv' })
    expect((fetcher.request as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  test('manual selection is not overwritten by a later auto match', async () => {
    const map = new FakeMapRepo()
    const fetcher = fakeFetcher([
      [/\/match/, { data: { isMatched: true, matches: [{ episodeId: 999, animeId: 3, animeTitle: 'A', episodeTitle: '第1话' }] } }],
    ])
    const svc = new MatchService(registryOf(new DandanplayProvider(fetcher)), map as unknown as DanmakuMapRepo)
    svc.saveManual({ provider: 'dandanplay', serverId: 's1', embyItemId: 'e1', seasonId: '3', indexedId: '500' })
    const result = await svc.autoMatch({ embyItemId: 'e1', serverId: 's1', fileName: 'a.mkv' })
    expect(result?.indexedId).toBe('500')
    expect(result?.source).toBe('manual')
  })
})

describe('ProviderRegistry', () => {
  function stubProvider(id: 'dandanplay' | 'bilibili', matchHit: boolean): DanmakuSourceProvider {
    return {
      id,
      match: vi.fn(async () =>
        matchHit ? { provider: id, providerIds: { animeId: 1 }, indexedId: '9', title: 't' } : null,
      ),
      search: vi.fn(async () => []),
      episodes: vi.fn(async () => []),
      getComments: vi.fn(async () => []),
    }
  }

  test('get() returns enabled providers by id and skips disabled', () => {
    const ddp = stubProvider('dandanplay', true)
    const bili = stubProvider('bilibili', true)
    const reg = new ProviderRegistry([
      { provider: ddp, enabled: true, sortOrder: 0 },
      { provider: bili, enabled: false, sortOrder: 1 },
    ])
    expect(reg.get('dandanplay')).toBe(ddp)
    expect(reg.get('bilibili')).toBeUndefined()
    expect(reg.enabledByPriority()).toEqual([ddp])
  })

  test('autoMatch falls through to the next provider in priority order', async () => {
    const ddp = stubProvider('dandanplay', false) // misses
    const bili = stubProvider('bilibili', true) // hits
    const reg = new ProviderRegistry([
      { provider: ddp, enabled: true, sortOrder: 0 },
      { provider: bili, enabled: true, sortOrder: 1 },
    ])
    const map = new FakeMapRepo()
    const svc = new MatchService(reg, map as unknown as DanmakuMapRepo)
    const mapping = await svc.autoMatch({ embyItemId: 'e1', serverId: 's1', fileName: 'a.mkv' })
    expect(mapping?.provider).toBe('bilibili')
    expect(ddp.match).toHaveBeenCalledOnce()
    expect(bili.match).toHaveBeenCalledOnce()
  })
})

describe('DanmakuService', () => {
  test('caches a pulled track and serves cache on the second call', async () => {
    const fetcher = fakeFetcher([
      [/\/comment\//, { data: { count: 2, comments: [{ cid: 1, p: '1,1,16777215,u', m: 'a' }, { cid: 2, p: '2,1,255,u', m: 'b' }] } }],
    ])
    const cache = new FakeCacheRepo()
    const svc = new DanmakuService(
      registryOf(new DandanplayProvider(fetcher)),
      new FakeMapRepo() as unknown as DanmakuMapRepo,
      cache as unknown as DanmakuCacheRepo,
    )
    const mapping: DanmakuMapping = {
      embyItemId: 'e1', serverId: 's1', provider: 'dandanplay',
      seasonId: '3', indexedId: '7', source: 'auto', matchedAt: Date.now(),
    }
    const track = await svc.getDanmaku(mapping)
    expect(track.commentCount).toBe(2)
    await svc.getDanmaku(mapping)
    expect((fetcher.request as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  test('falls back to stale cache when a forced re-fetch fails', async () => {
    const cache = new FakeCacheRepo()
    cache.upsert({
      provider: 'dandanplay', providerConfigId: 'x', indexedId: '7', seasonId: '3',
      comments: [{ p: '1,1,16777215,u', m: 'old' }], commentCount: 1, lastChecked: Date.now(),
    })
    const fetcher = fakeFetcher([[/\/comment\//, { status: 500, ok: false, data: {} }]])
    const svc = new DanmakuService(
      registryOf(new DandanplayProvider(fetcher)),
      new FakeMapRepo() as unknown as DanmakuMapRepo,
      cache as unknown as DanmakuCacheRepo,
    )
    const mapping: DanmakuMapping = {
      embyItemId: 'e1', serverId: 's1', provider: 'dandanplay',
      seasonId: '3', indexedId: '7', source: 'auto', matchedAt: Date.now(),
    }
    const track = await svc.getDanmaku(mapping, true)
    expect(track.comments[0].m).toBe('old')
  })

  test('toAss renders cached comments to an ASS document', async () => {
    const svc = new DanmakuService(
      registryOf(new DandanplayProvider(fakeFetcher([]))),
      new FakeMapRepo() as unknown as DanmakuMapRepo,
      new FakeCacheRepo() as unknown as DanmakuCacheRepo,
    )
    const ass = svc.toAss([{ p: '1,1,16777215,u', m: 'hi' }], { width: 1920, height: 1080 })
    expect(ass).toContain('[Events]')
    expect(ass).toMatch(/Dialogue:/)
  })
})
