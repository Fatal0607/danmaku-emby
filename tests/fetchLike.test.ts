import { describe, expect, test, vi } from 'vitest'
import { HttpFetchLike } from '@/../electron/main/net/FetchLike'

describe('HttpFetchLike', () => {
  test('keeps 403 empty JSON responses inspectable', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('', {
        status: 403,
        headers: {
          'X-Error-Message': 'Invalid AppId',
          'Content-Length': '0',
        },
      }),
    ) as unknown as typeof fetch
    const fetcher = new HttpFetchLike(fetchImpl)

    const res = await fetcher.request({
      url: 'https://api.dandanplay.net/api/v2/search/episodes?anime=test',
      responseType: 'json',
    })

    expect(res.status).toBe(403)
    expect(res.data).toBeNull()
    expect(res.headers['x-error-message']).toBe('Invalid AppId')
  })
})
