import { describe, expect, it } from 'vitest'
import { HttpFetchLike } from '../../electron/main/net/FetchLike'
import { DandanplayProvider } from '../../electron/main/danmaku/providers/dandanplay/DandanplayProvider'

// Live dandanplay smoke (docs 04 §4.5). The official API requires AppId signing
// (a bare request returns 403), so this is skipped unless credentials OR a
// signing-proxy base URL are provided via env — never hard-code an appSecret:
//   DDP_APP_ID=... DDP_APP_SECRET=... npx vitest run tests/smoke/dandanplay.smoke.test.ts
//   # or, via a self-hosted signing proxy:
//   DDP_BASE_URL=https://your-proxy/ddp npx vitest run tests/smoke/dandanplay.smoke.test.ts

const appId = process.env.DDP_APP_ID
const appSecret = process.env.DDP_APP_SECRET
const baseUrl = process.env.DDP_BASE_URL
const keyword = process.env.DDP_KEYWORD ?? '进击的巨人'
const enabled = Boolean((appId && appSecret) || baseUrl)

describe.runIf(enabled)('dandanplay live smoke', () => {
  const provider = new DandanplayProvider(new HttpFetchLike(), {
    baseUrl,
    credentials: appId && appSecret ? { appId, appSecret } : undefined,
  })

  it('searches, lists episodes, and pulls comments', async () => {
    const seasons = await provider.search(keyword)
    expect(Array.isArray(seasons)).toBe(true)
    console.info('[ddp] seasons:', seasons.slice(0, 3).map((s) => s.title).join(' | '))
    if (!seasons.length) return

    const episodes = await provider.episodes(seasons[0].indexedId)
    console.info('[ddp] episodes:', episodes.length, 'first:', episodes[0]?.title)
    if (!episodes.length) return

    const comments = await provider.getComments(episodes[0].indexedId)
    expect(comments.length).toBeGreaterThan(0)
    console.info('[ddp] comments:', comments.length, 'sample p:', comments[0]?.p)
  })
})
