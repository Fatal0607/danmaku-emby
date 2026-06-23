import { describe, expect, it } from 'vitest'
import { HttpFetchLike } from '../../electron/main/net/FetchLike'
import { EmbyService } from '../../electron/main/emby/EmbyService'
import type { EmbyServer } from '../../shared/types/emby'

// Live platform smoke test (docs 07 §7.4). Skipped unless real credentials are
// passed via env — NEVER hard-code credentials here. Run with:
//   EMBY_ADDRESS=... EMBY_USERNAME=... EMBY_PASSWORD=... \
//     npx vitest run tests/smoke/emby.smoke.test.ts

const address = process.env.EMBY_ADDRESS
const username = process.env.EMBY_USERNAME
const password = process.env.EMBY_PASSWORD
const hasCreds = Boolean(address && username && password)

describe.runIf(hasCreds)('Emby live smoke', () => {
  let token = ''
  let server: EmbyServer
  const svc = new EmbyService({
    fetcher: new HttpFetchLike(),
    deviceId: 'smoke-test-device',
    getToken: () => token,
  })

  it('discovers the server', async () => {
    const info = await svc.discover(address!)
    expect(info.Id).toBeTruthy()
    console.info('[smoke] server:', info.ServerName, info.Version)
  })

  it('authenticates and returns a token', async () => {
    const session = await svc.authenticate({
      address: address!,
      username: username!,
      password: password!,
    })
    token = session.token
    server = session.server
    expect(token.length).toBeGreaterThan(0)
    expect(server.userId).toBeTruthy()
    console.info('[smoke] auth ok, userId:', server.userId, 'baseUrl:', server.baseUrl)
  })

  it('lists views', async () => {
    const views = await svc.getViews(server)
    expect(Array.isArray(views)).toBe(true)
    console.info(
      '[smoke] views:',
      views.map((v) => `${v.name}(${v.collectionType ?? '?'})`).join(', '),
    )
  })

  it('browses recently-added items', async () => {
    const page = await svc.getItems(server, {
      serverId: server.id,
      recursive: true,
      includeItemTypes: ['Movie', 'Series'],
      sortBy: 'DateCreated',
      sortOrder: 'Descending',
      limit: 5,
    })
    expect(page.total).toBeGreaterThanOrEqual(0)
    console.info(
      '[smoke] items:',
      page.total,
      'sample:',
      page.items.map((i) => `${i.name}[${i.type}]`).join(' | '),
    )
  })

  it('resolves a playable source (DirectPlay) for the first movie', async () => {
    const page = await svc.getItems(server, {
      serverId: server.id,
      recursive: true,
      includeItemTypes: ['Movie'],
      limit: 1,
    })
    if (!page.items.length) {
      console.info('[smoke] no movies to resolve — skipping playback check')
      return
    }
    const itemId = page.items[0].id
    const src = await svc.resolvePlaybackSource(server, itemId)
    expect(src.url).toMatch(/^https?:\/\//)
    console.info(
      '[smoke] playback:',
      page.items[0].name,
      '| mode:',
      src.mode,
      '| container:',
      src.container,
      '| audio:',
      src.audioStreams.map((a) => a.codec).join(','),
      '| file:',
      src.fileName,
    )
  })
})
