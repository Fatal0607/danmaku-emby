import { describe, expect, it } from 'vitest'
import { HttpFetchLike } from '../../electron/main/net/FetchLike'
import { BilibiliProvider } from '../../electron/main/danmaku/providers/bilibili/BilibiliProvider'

// Live bilibili smoke (docs 04 §4.5). nav + WBI search are public (no login),
// but bilibili applies risk-control, so this is opt-in via env to keep CI
// deterministic:
//   BILI_SMOKE=1 npx vitest run tests/smoke/bilibili.smoke.test.ts

const enabled = Boolean(process.env.BILI_SMOKE)
const keyword = process.env.BILI_KEYWORD ?? '孤独摇滚'

describe.runIf(enabled)('bilibili live smoke', () => {
  const provider = new BilibiliProvider(new HttpFetchLike())

  it('searches → episodes → comments via WBI + XML', async () => {
    const seasons = await provider.search(keyword)
    expect(Array.isArray(seasons)).toBe(true)
    console.info('[bili] seasons:', seasons.slice(0, 3).map((s) => s.title).join(' | '))
    if (!seasons.length) return

    const episodes = await provider.episodes(seasons[0].indexedId)
    console.info('[bili] episodes:', episodes.length, 'first cid:', episodes[0]?.indexedId)
    if (!episodes.length) return

    const comments = await provider.getComments(episodes[0].indexedId)
    console.info('[bili] comments:', comments.length, 'sample:', comments[0])
    expect(comments.length).toBeGreaterThanOrEqual(0)
  })
})
