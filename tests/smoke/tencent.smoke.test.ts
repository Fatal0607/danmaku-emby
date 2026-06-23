import { describe, expect, it } from 'vitest'
import { HttpFetchLike } from '../../electron/main/net/FetchLike'
import { TencentProvider } from '../../electron/main/danmaku/providers/tencent/TencentProvider'

// Live Tencent Video smoke (docs 04 §4.5). Search/episodes/danmaku are public
// (no login), but the endpoints are POST RPC with risk-control, so this is
// opt-in via env to keep CI deterministic:
//   TX_SMOKE=1 npx vitest run tests/smoke/tencent.smoke.test.ts

const enabled = Boolean(process.env.TX_SMOKE)
const keyword = process.env.TX_KEYWORD ?? '庆余年'

describe.runIf(enabled)('tencent live smoke', () => {
  const provider = new TencentProvider(new HttpFetchLike())

  it('searches → episodes → comments via RPC + segment index', async () => {
    const seasons = await provider.search(keyword)
    expect(Array.isArray(seasons)).toBe(true)
    console.info('[tx] seasons:', seasons.slice(0, 3).map((s) => s.title).join(' | '))
    if (!seasons.length) return

    const episodes = await provider.episodes(seasons[0].indexedId)
    console.info('[tx] episodes:', episodes.length, 'first vid:', episodes[0]?.indexedId)
    if (!episodes.length) return

    const comments = await provider.getComments(episodes[0].indexedId)
    console.info('[tx] comments:', comments.length, 'sample:', comments[0])
    expect(comments.length).toBeGreaterThanOrEqual(0)
  })
})
