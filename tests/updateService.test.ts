import { describe, expect, test, vi } from 'vitest'
import {
  compareVersions,
  normalizeVersion,
  selectPreferredAsset,
  UpdateService,
} from '@/../electron/main/update/UpdateService'
import type { UpdateAsset } from '@shared/types/update'

function response(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), init)
}

describe('UpdateService version helpers', () => {
  test('normalizes a leading v prefix', () => {
    expect(normalizeVersion('v0.2.0')).toBe('0.2.0')
    expect(normalizeVersion('0.2.0')).toBe('0.2.0')
  })

  test('compares dotted versions numerically', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1)
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('0.1.0-beta.1', '0.1.0')).toBe(-1)
  })

  test('selects the macOS installer matching the current architecture', () => {
    const assets: UpdateAsset[] = [
      { name: 'DanmakuEmby-0.2.0-x64.dmg', downloadUrl: 'https://example.com/x64.dmg' },
      { name: 'DanmakuEmby-0.2.0-arm64.dmg', downloadUrl: 'https://example.com/arm64.dmg' },
    ]

    expect(selectPreferredAsset(assets, 'darwin', 'arm64')?.name).toBe(
      'DanmakuEmby-0.2.0-arm64.dmg',
    )
  })
})

describe('UpdateService', () => {
  test('maps GitHub latest release into update check result', async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        tag_name: 'v0.2.0',
        name: 'DanmakuEmby 0.2.0',
        html_url: 'https://github.com/Fatal0607/danmaku-emby/releases/tag/v0.2.0',
        body: '更新说明',
        published_at: '2026-06-25T10:00:00Z',
        assets: [
          {
            name: 'DanmakuEmby-0.2.0-arm64.dmg',
            browser_download_url: 'https://github.com/download/arm64.dmg',
            content_type: 'application/x-apple-diskimage',
            size: 123,
          },
        ],
      }),
    ) as unknown as typeof fetch

    const service = new UpdateService({
      owner: 'Fatal0607',
      repo: 'danmaku-emby',
      currentVersion: '0.1.0',
      platform: 'darwin',
      arch: 'arm64',
      isPackaged: false,
      fetchImpl,
    })

    const result = await service.checkForUpdates()

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/Fatal0607/danmaku-emby/releases/latest',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    )
    expect(result.currentVersion).toBe('0.1.0')
    expect(result.latestVersion).toBe('0.2.0')
    expect(result.updateAvailable).toBe(true)
    expect(result.preferredAsset?.name).toBe('DanmakuEmby-0.2.0-arm64.dmg')
  })

  test('throws a friendly error for empty GitHub JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch
    const service = new UpdateService({
      owner: 'Fatal0607',
      repo: 'danmaku-emby',
      currentVersion: '0.1.0',
      platform: 'darwin',
      arch: 'arm64',
      isPackaged: false,
      fetchImpl,
    })

    await expect(service.checkForUpdates()).rejects.toThrow('GitHub Release 响应为空')
  })

  test('explains missing public releases for GitHub 404', async () => {
    const fetchImpl = vi.fn(async () =>
      response({ message: 'Not Found' }, { status: 404 }),
    ) as unknown as typeof fetch
    const service = new UpdateService({
      owner: 'Fatal0607',
      repo: 'danmaku-emby',
      currentVersion: '0.1.0',
      platform: 'darwin',
      arch: 'arm64',
      isPackaged: false,
      fetchImpl,
    })

    await expect(service.checkForUpdates()).rejects.toThrow(
      '当前 GitHub 仓库没有可用的公开 Release',
    )
  })

  test('only allows opening the configured GitHub release page', () => {
    const service = new UpdateService({
      owner: 'Fatal0607',
      repo: 'danmaku-emby',
      currentVersion: '0.1.0',
      platform: 'darwin',
      arch: 'arm64',
      isPackaged: false,
    })

    expect(service.releasePageUrl()).toBe('https://github.com/Fatal0607/danmaku-emby/releases')
    expect(() => service.releasePageUrl('https://example.com')).toThrow(
      '只能打开当前应用 GitHub Release 页面',
    )
  })
})
