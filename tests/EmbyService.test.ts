import { describe, expect, test, vi } from 'vitest'
import type { FetchLike, FetchLikeRequest, FetchLikeResponse } from '@/../electron/main/net/FetchLike'
import {
  EmbyError,
  EmbyService,
  joinUrl,
  mapItem,
  secondsToTicks,
} from '@/../electron/main/emby/EmbyService'
import type { EmbyServer } from '@shared/types/emby'

const SERVER: EmbyServer = {
  id: 's1',
  name: 'Living Room',
  baseUrl: 'https://emby.local:8096',
  userId: 'u1',
  username: 'cinephile',
  createdAt: 0,
}

/** Programmable fetcher: maps url substrings to canned responses. */
function fakeFetcher(routes: Array<[RegExp, Partial<FetchLikeResponse>]>): FetchLike {
  return {
    request: vi.fn(async (req: FetchLikeRequest) => {
      const hit = routes.find(([re]) => re.test(req.url))
      const base = { status: 200, ok: true, headers: {}, data: {} }
      return { ...base, ...(hit?.[1] ?? {}) } as FetchLikeResponse
    }),
  }
}

function makeService(fetcher: FetchLike, token: string | null = 'tok-123') {
  return new EmbyService({ fetcher, deviceId: 'dev-uuid', getToken: () => token })
}

describe('normalizeAddress', () => {
  test('defaults to https and strips trailing slash', () => {
    expect(EmbyService.normalizeAddress('emby.local:8096')).toBe('https://emby.local:8096')
    expect(EmbyService.normalizeAddress('http://x/')).toBe('http://x')
  })
})

describe('buildAuthHeader', () => {
  test('includes client/device identifiers and token', () => {
    const svc = makeService(fakeFetcher([]))
    const header = svc.buildAuthHeader('abc')
    expect(header).toContain('MediaBrowser')
    expect(header).toContain('Client="DanmakuEmby"')
    expect(header).toContain('DeviceId="dev-uuid"')
    expect(header).toContain('Token="abc"')
  })
})

describe('authenticate', () => {
  test('discovers then returns server + token', async () => {
    const fetcher = fakeFetcher([
      [/System\/Info\/Public/, { data: { ServerName: 'LR', Version: '4.8', Id: 's1' } }],
      [
        /AuthenticateByName/,
        { data: { AccessToken: 'tok', ServerId: 's1', User: { Id: 'u1', Name: 'cinephile' } } },
      ],
    ])
    const session = await makeService(fetcher).authenticate({
      address: 'emby.local:8096',
      username: 'cinephile',
      password: 'pw',
    })
    expect(session.token).toBe('tok')
    expect(session.server.id).toBe('s1')
    expect(session.server.baseUrl).toBe('https://emby.local:8096')
  })

  test('maps 401 to EMBY_AUTH_FAILED', async () => {
    const fetcher = fakeFetcher([
      [/System\/Info\/Public/, { data: { ServerName: 'LR', Version: '4', Id: 's1' } }],
      [/AuthenticateByName/, { status: 401, ok: false, data: {} }],
    ])
    await expect(
      makeService(fetcher).authenticate({ address: 'x', username: 'a', password: 'b' }),
    ).rejects.toMatchObject({ code: 'EMBY_AUTH_FAILED' })
  })

  test('non-emby host yields EMBY_INVALID_SERVER', async () => {
    const fetcher = fakeFetcher([[/System\/Info\/Public/, { data: {} }]])
    await expect(
      makeService(fetcher).discover('example.com'),
    ).rejects.toBeInstanceOf(EmbyError)
  })
})

describe('resolvePlaybackSource', () => {
  test('direct-play builds a Static stream URL with token + deviceId', async () => {
    const fetcher = fakeFetcher([
      [
        /PlaybackInfo/,
        {
          data: {
            MediaSources: [
              {
                Id: 'ms1',
                Container: 'mkv',
                Path: '/media/Show/S01E07.mkv',
                Size: 1234,
                SupportsDirectPlay: true,
                MediaStreams: [
                  { Type: 'Audio', Index: 1, Codec: 'ac3', Language: 'jpn' },
                  { Type: 'Subtitle', Index: 2, Codec: 'ass', IsExternal: true },
                ],
              },
            ],
          },
        },
      ],
    ])
    const src = await makeService(fetcher).resolvePlaybackSource(SERVER, 'item9', secondsToTicks(60))
    expect(src.mode).toBe('directPlay')
    expect(src.url).toContain('/Videos/item9/stream')
    expect(src.url).toContain('Static=true')
    expect(src.url).toContain('api_key=tok-123')
    expect(src.url).toContain('DeviceId=dev-uuid')
    expect(src.fileName).toBe('S01E07.mkv')
    expect(src.audioStreams[0].codec).toBe('ac3')
    expect(src.subtitleStreams[0].codec).toBe('ass')
  })

  test('falls back to TranscodingUrl when direct play unsupported', async () => {
    const fetcher = fakeFetcher([
      [
        /PlaybackInfo/,
        {
          data: {
            MediaSources: [
              { Id: 'ms1', SupportsDirectPlay: false, TranscodingUrl: '/videos/x/master.m3u8' },
            ],
          },
        },
      ],
    ])
    const src = await makeService(fetcher).resolvePlaybackSource(SERVER, 'item9')
    expect(src.mode).toBe('transcode')
    expect(src.url).toBe('https://emby.local:8096/videos/x/master.m3u8')
  })

  test('no media source → EMBY_NO_SOURCE', async () => {
    const fetcher = fakeFetcher([[/PlaybackInfo/, { data: { MediaSources: [] } }]])
    await expect(
      makeService(fetcher).resolvePlaybackSource(SERVER, 'item9'),
    ).rejects.toMatchObject({ code: 'EMBY_NO_SOURCE' })
  })
})

describe('mapItem', () => {
  test('derives resume percentage from position/runtime ticks', () => {
    const item = mapItem(
      {
        Id: 'i1',
        Name: 'X',
        Type: 'Episode',
        RunTimeTicks: 1000,
        UserData: { PlaybackPositionTicks: 250 },
      },
      's1',
    )
    expect(item.playedPercentage).toBeCloseTo(0.25)
    expect(item.type).toBe('Episode')
  })
})

describe('joinUrl', () => {
  test('joins base + path and passes through absolute urls', () => {
    expect(joinUrl('https://a/', '/b/c')).toBe('https://a/b/c')
    expect(joinUrl('https://a', 'https://x/y')).toBe('https://x/y')
  })
})
