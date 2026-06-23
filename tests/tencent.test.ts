import { describe, expect, test, vi } from 'vitest'
import type {
  FetchLike,
  FetchLikeRequest,
  FetchLikeResponse,
} from '@/../electron/main/net/FetchLike'
import { TencentProvider } from '@/../electron/main/danmaku/providers/tencent/TencentProvider'
import {
  pageItemToEpisode,
  searchItemToSeason,
  stripHtml,
} from '@/../electron/main/danmaku/providers/tencent/mapping'
import { parseTencentSegment } from '@/../electron/main/danmaku/net/decoders/tencentDanmaku'

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

describe('tencent mapping', () => {
  test('stripHtml removes highlight tags', () => {
    expect(stripHtml('星海<em class="adsemcolor">彼端</em>')).toBe('星海彼端')
  })

  test('searchItemToSeason maps cid, title and year', () => {
    const s = searchItemToSeason({
      doc: { id: 'mzc00200abc' },
      videoInfo: { title: '<em>星海</em>彼端', typeName: '电影', year: 2024 },
    })
    expect(s).not.toBeNull()
    expect(s?.provider).toBe('tencent')
    expect(s?.indexedId).toBe('mzc00200abc')
    expect(s?.title).toBe('星海彼端')
    expect(s?.year).toBe(2024)
  })

  test('searchItemToSeason returns null without a cid', () => {
    expect(searchItemToSeason({ videoInfo: { title: 'x' } })).toBeNull()
  })

  test('pageItemToEpisode maps vid and parses the episode number', () => {
    const e = pageItemToEpisode({ item_params: { vid: 'v123', title: '第 7 集' } })
    expect(e?.indexedId).toBe('v123')
    expect(e?.providerIds.vid).toBe('v123')
    expect(e?.episodeNumber).toBe(7)
  })

  test('pageItemToEpisode drops trailers', () => {
    expect(
      pageItemToEpisode({ item_params: { vid: 'v9', title: '预告', is_trailer: '1' } }),
    ).toBeNull()
  })
})

describe('parseTencentSegment', () => {
  test('converts ms offsets to seconds and styled color to decimal', () => {
    const out = parseTencentSegment({
      barrage_list: [
        { time_offset: '10500', content: '前方高能' },
        {
          time_offset: '20000',
          content: '彩色弹幕',
          content_style: JSON.stringify({ color: 'ff0000' }),
        },
        {
          time_offset: '30000',
          content: '渐变弹幕',
          content_style: JSON.stringify({ gradient_colors: ['00ff00', '0000ff'] }),
        },
      ],
    })
    expect(out).toEqual([
      { p: '10.50,1,16777215,', m: '前方高能' },
      { p: '20.00,1,16711680,', m: '彩色弹幕' },
      { p: '30.00,1,65280,', m: '渐变弹幕' },
    ])
  })

  test('treats literal white and bad styles as the default color', () => {
    const out = parseTencentSegment({
      barrage_list: [
        { time_offset: '0', content: 'a', content_style: JSON.stringify({ color: 'ffffff' }) },
        { time_offset: '0', content: 'b', content_style: '{not json' },
      ],
    })
    expect(out.every((c) => c.p.split(',')[2] === '16777215')).toBe(true)
  })

  test('skips empty content and missing list', () => {
    expect(parseTencentSegment({ barrage_list: [{ time_offset: '1', content: '  ' }] })).toEqual([])
    expect(parseTencentSegment({})).toEqual([])
  })
})

describe('TencentProvider', () => {
  test('match is a no-op (no filename matching on tencent)', async () => {
    const provider = new TencentProvider(fakeFetcher([]))
    expect(await provider.match({ embyItemId: 'e', serverId: 's', fileName: 'x.mkv' })).toBeNull()
  })

  test('search posts to MbSearch and maps results', async () => {
    const fetcher = fakeFetcher([
      [
        /MultiTerminalSearch/,
        {
          data: {
            data: {
              normalList: {
                itemList: [
                  { doc: { id: 'cid1' }, videoInfo: { title: '星海彼端', typeName: '电影' } },
                  { videoInfo: { title: 'no cid' } },
                ],
              },
            },
          },
        },
      ],
    ])
    const seasons = await new TencentProvider(fetcher).search('星海')
    expect(seasons).toHaveLength(1)
    expect(seasons[0].indexedId).toBe('cid1')
    const call = (fetcher.request as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.method).toBe('POST')
    expect(call.rewriteHeaders.Origin).toBe('https://v.qq.com')
    expect(JSON.parse(call.body).query).toBe('星海')
  })

  test('episodes flattens module data and filters trailers', async () => {
    const fetcher = fakeFetcher([
      [
        /GetPageData/,
        {
          data: {
            data: {
              module_list_datas: [
                {
                  module_datas: [
                    {
                      item_data_lists: {
                        item_datas: [
                          { item_params: { vid: 'v1', title: '第 1 集' } },
                          { item_params: { vid: 'v2', title: '预告', is_trailer: '1' } },
                          { item_params: { vid: 'v3', union_title: '第 2 集 回响' } },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    ])
    const eps = await new TencentProvider(fetcher).episodes('cid1')
    expect(eps.map((e) => e.indexedId)).toEqual(['v1', 'v3'])
    expect(eps[1].title).toBe('第 2 集 回响')
  })

  test('getComments walks the segment index and merges segments', async () => {
    const fetcher = fakeFetcher([
      [
        /barrage\/base\//,
        {
          data: {
            segment_index: {
              '0': { segment_name: 'seg_0', segment_start: '0' },
              '300000': { segment_name: 'seg_1', segment_start: '300000' },
            },
          },
        },
      ],
      [/barrage\/segment\/v1\/seg_0/, { data: { barrage_list: [{ time_offset: '1000', content: 'a' }] } }],
      [/barrage\/segment\/v1\/seg_1/, { data: { barrage_list: [{ time_offset: '301000', content: 'b' }] } }],
    ])
    const comments = await new TencentProvider(fetcher).getComments('v1')
    expect(comments).toEqual([
      { p: '1.00,1,16777215,', m: 'a' },
      { p: '301.00,1,16777215,', m: 'b' },
    ])
  })

  test('getComments returns empty when there is no danmaku index', async () => {
    const fetcher = fakeFetcher([[/barrage\/base\//, { data: { segment_index: {} } }]])
    expect(await new TencentProvider(fetcher).getComments('v9')).toEqual([])
  })

  test('a failed segment does not blank the whole track', async () => {
    const fetcher = fakeFetcher([
      [
        /barrage\/base\//,
        {
          data: {
            segment_index: {
              '0': { segment_name: 'ok' },
              '1': { segment_name: 'bad' },
            },
          },
        },
      ],
      [/segment\/v1\/ok/, { data: { barrage_list: [{ time_offset: '0', content: 'kept' }] } }],
      [/segment\/v1\/bad/, { status: 500, ok: false, data: {} }],
    ])
    const comments = await new TencentProvider(fetcher).getComments('v1')
    expect(comments).toEqual([{ p: '0.00,1,16777215,', m: 'kept' }])
  })

  test('maps 429 to DM_RATE_LIMITED', async () => {
    const fetcher = fakeFetcher([[/MultiTerminalSearch/, { status: 429, ok: false, data: {} }]])
    await expect(new TencentProvider(fetcher).search('x')).rejects.toMatchObject({
      code: 'DM_RATE_LIMITED',
    })
  })
})
