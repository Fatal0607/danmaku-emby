import { describe, expect, test, vi } from 'vitest'
import type {
  FetchLike,
  FetchLikeRequest,
  FetchLikeResponse,
} from '@/../electron/main/net/FetchLike'
import {
  encodeWbi,
  extractWbiKey,
  getMixinKey,
} from '@/../electron/main/danmaku/providers/bilibili/wbi'
import { parseBiliXml, decodeXmlEntities } from '@/../electron/main/danmaku/net/decoders/biliXml'
import { BilibiliProvider } from '@/../electron/main/danmaku/providers/bilibili/BilibiliProvider'
import {
  searchMediaToSeason,
  stripHtml,
} from '@/../electron/main/danmaku/providers/bilibili/mapping'

function fakeFetcher(routes: Array<[RegExp, Partial<FetchLikeResponse>]>): FetchLike {
  return {
    request: vi.fn(async (req: FetchLikeRequest) => {
      const hit = routes.find(([re]) => re.test(req.url))
      return {
        status: 200,
        ok: true,
        headers: {},
        data: {},
        ...(hit?.[1] ?? {}),
      } as FetchLikeResponse
    }),
  }
}

const NAV = [
  /web-interface\/nav/,
  {
    data: {
      code: 0,
      data: {
        isLogin: false,
        wbi_img: {
          img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
          sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
        },
      },
    },
  },
] as [RegExp, Partial<FetchLikeResponse>]

describe('WBI signing', () => {
  test('extractWbiKey strips path and extension', () => {
    expect(extractWbiKey('https://i0.hdslb.com/bfs/wbi/abc123.png')).toBe('abc123')
  })

  test('getMixinKey matches the published spec vector', () => {
    // Public bilibili example: these img/sub keys reorder to this mixin key.
    const mixin = getMixinKey(
      '7cd084941338484aae1ad9425b84077c',
      '4932caff0ff746eab6f01bf08b70ac45',
    )
    expect(mixin).toBe('ea1db124af3c7062474693fa704f4ff8')
    expect(mixin).toHaveLength(32)
  })

  test('encodeWbi appends sorted params, wts and a 32-hex w_rid', () => {
    const keys = { imgKey: '7cd084941338484aae1ad9425b84077c', subKey: '4932caff0ff746eab6f01bf08b70ac45' }
    const q = encodeWbi({ foo: '114', bar: '514' }, keys, 1700000000)
    expect(q).toMatch(/^bar=514&foo=114&wts=1700000000&w_rid=[0-9a-f]{32}$/)
    // Deterministic for identical inputs.
    expect(encodeWbi({ foo: '114', bar: '514' }, keys, 1700000000)).toBe(q)
  })
})

describe('parseBiliXml', () => {
  const xml = `<?xml version="1.0"?><i>
    <d p="10.5,1,25,16777215,1700000000,0,abcd1234,111">滚动弹幕</d>
    <d p="20.0,5,25,16711680,1700000001,0,ef567890,222">顶部弹幕</d>
    <d p="30.0,4,25,255,1700000002,0,99887766,333">底部 &amp; 转义</d>
  </i>`

  test('decodes entries to canonical {p,m} with normalized mode', () => {
    const out = parseBiliXml(xml)
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ p: '10.5,1,16777215,abcd1234', m: '滚动弹幕' })
    expect(out[1]).toEqual({ p: '20.0,5,16711680,ef567890', m: '顶部弹幕' })
    expect(out[2].p).toBe('30.0,4,255,99887766')
    expect(out[2].m).toBe('底部 & 转义')
  })

  test('skips malformed entries', () => {
    expect(parseBiliXml('<i><d p="bad">x</d></i>')).toHaveLength(0)
  })

  test('decodeXmlEntities handles named and numeric refs', () => {
    expect(decodeXmlEntities('a&lt;b&gt;c&amp;d&#65;')).toBe('a<b>c&dA')
  })
})

describe('bilibili mapping', () => {
  test('stripHtml removes highlight tags', () => {
    expect(stripHtml('星海<em class="keyword">彼端</em>')).toBe('星海彼端')
  })

  test('searchMediaToSeason maps season id and year', () => {
    const s = searchMediaToSeason({
      season_id: 12345,
      media_id: 67890,
      title: '<em>星海</em>彼端',
      season_type_name: '番剧',
      pubtime: 1704067200,
      ep_size: 12,
    })
    expect(s.indexedId).toBe('12345')
    expect(s.title).toBe('星海彼端')
    expect(s.episodeCount).toBe(12)
    expect(s.year).toBe(2024)
  })
})

describe('BilibiliProvider', () => {
  test('match is a no-op (no filename matching on bilibili)', async () => {
    const provider = new BilibiliProvider(fakeFetcher([]))
    expect(await provider.match({ embyItemId: 'e', serverId: 's', fileName: 'x.mkv' })).toBeNull()
  })

  test('search fetches WBI keys then signs the request', async () => {
    const fetcher = fakeFetcher([
      NAV,
      [
        /wbi\/search\/type/,
        { data: { code: 0, data: { result: [{ season_id: 1, title: 'A', ep_size: 12 }] } } },
      ],
    ])
    const seasons = await new BilibiliProvider(fetcher).search('A')
    expect(seasons[0].title).toBe('A')
    const calls = (fetcher.request as ReturnType<typeof vi.fn>).mock.calls
    // nav first, then the signed search.
    expect(calls[0][0].url).toMatch(/nav/)
    expect(calls[1][0].url).toMatch(/w_rid=[0-9a-f]{32}/)
    expect(calls[1][0].rewriteHeaders.Referer).toBe('https://www.bilibili.com/')
  })

  test('episodes maps cid as the danmaku indexedId', async () => {
    const fetcher = fakeFetcher([
      [
        /pgc\/view\/web\/season/,
        {
          data: {
            code: 0,
            result: {
              season_id: 1,
              title: 'A',
              episodes: [{ id: 9, cid: 555, aid: 7, bvid: 'BV1', title: '1', long_title: '回响' }],
            },
          },
        },
      ],
    ])
    const eps = await new BilibiliProvider(fetcher).episodes('1')
    expect(eps[0].indexedId).toBe('555')
    expect(eps[0].title).toBe('回响')
    expect(eps[0].providerIds.cid).toBe(555)
  })

  test('getComments parses list.so XML by cid', async () => {
    const fetcher = fakeFetcher([
      [
        /x\/v1\/dm\/list\.so/,
        { data: '<i><d p="1.0,1,25,16777215,0,0,hash,1">hi</d></i>' },
      ],
    ])
    const comments = await new BilibiliProvider(fetcher).getComments('555')
    expect(comments).toEqual([{ p: '1.0,1,16777215,hash', m: 'hi' }])
  })

  test('maps risk-control 412 to DM_RATE_LIMITED', async () => {
    const fetcher = fakeFetcher([[/list\.so/, { status: 412, ok: false, data: '' }]])
    await expect(new BilibiliProvider(fetcher).getComments('1')).rejects.toMatchObject({
      code: 'DM_RATE_LIMITED',
    })
  })
})
