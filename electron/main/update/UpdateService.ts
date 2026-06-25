import type {
  UpdateAsset,
  UpdateCheckResult,
  UpdateCurrentInfo,
} from '@shared/types/update'

export class UpdateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpdateError'
  }
}

export interface UpdateServiceOptions {
  owner: string
  repo: string
  currentVersion: string
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  isPackaged: boolean
  fetchImpl?: typeof fetch
}

interface GitHubReleaseAsset {
  name?: unknown
  browser_download_url?: unknown
  content_type?: unknown
  size?: unknown
}

interface GitHubRelease {
  tag_name?: unknown
  name?: unknown
  html_url?: unknown
  body?: unknown
  published_at?: unknown
  assets?: unknown
}

export class UpdateService {
  private readonly fetchImpl: typeof fetch
  private readonly owner: string
  private readonly repo: string
  private readonly currentVersion: string
  private readonly platform: NodeJS.Platform
  private readonly arch: NodeJS.Architecture
  private readonly isPackaged: boolean

  constructor(options: UpdateServiceOptions) {
    this.owner = options.owner
    this.repo = options.repo
    this.currentVersion = normalizeVersion(options.currentVersion)
    this.platform = options.platform
    this.arch = options.arch
    this.isPackaged = options.isPackaged
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  current(): UpdateCurrentInfo {
    return {
      currentVersion: this.currentVersion,
      repository: this.repository,
      releasePageUrl: this.releasePageUrl(),
      platform: this.platform,
      arch: this.arch,
      isPackaged: this.isPackaged,
    }
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const release = await this.fetchLatestRelease()
    const latestVersion = normalizeVersion(release.tagName)
    const assets = release.assets
    const preferredAsset = selectPreferredAsset(assets, this.platform, this.arch)

    return {
      ...this.current(),
      latestVersion,
      releaseName: release.name,
      releaseUrl: release.htmlUrl,
      releaseNotes: release.body,
      publishedAt: release.publishedAt,
      updateAvailable: compareVersions(latestVersion, this.currentVersion) > 0,
      assets,
      preferredAsset,
    }
  }

  releasePageUrl(url?: string): string {
    const fallback = `https://github.com/${this.owner}/${this.repo}/releases`
    const target = url ?? fallback
    const allowedPrefix = `https://github.com/${this.owner}/${this.repo}/releases`
    if (!target.startsWith(allowedPrefix)) {
      throw new UpdateError('只能打开当前应用 GitHub Release 页面')
    }
    return target
  }

  private get repository(): string {
    return `${this.owner}/${this.repo}`
  }

  private async fetchLatestRelease(): Promise<{
    tagName: string
    name?: string
    htmlUrl: string
    body?: string
    publishedAt?: string
    assets: UpdateAsset[]
  }> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'DanmakuEmby Update Checker',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
    } catch (e) {
      throw new UpdateError(`检查更新失败: ${messageOf(e)}`)
    }

    const text = await response.text()
    if (!response.ok) {
      if (response.status === 404) {
        throw new UpdateError('当前 GitHub 仓库没有可用的公开 Release')
      }
      const detail = readGitHubError(text)
      throw new UpdateError(
        detail || `检查更新失败: GitHub 返回 HTTP ${response.status}`,
      )
    }

    let payload: unknown
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      throw new UpdateError('检查更新失败: GitHub Release 响应不是有效 JSON')
    }

    return parseLatestRelease(payload)
  }
}

function parseLatestRelease(payload: unknown): {
  tagName: string
  name?: string
  htmlUrl: string
  body?: string
  publishedAt?: string
  assets: UpdateAsset[]
} {
  if (!payload || typeof payload !== 'object') {
    throw new UpdateError('检查更新失败: GitHub Release 响应为空')
  }
  const release = payload as GitHubRelease
  if (typeof release.tag_name !== 'string' || !release.tag_name.trim()) {
    throw new UpdateError('检查更新失败: Release 缺少 tag_name')
  }
  if (typeof release.html_url !== 'string' || !release.html_url.trim()) {
    throw new UpdateError('检查更新失败: Release 缺少 html_url')
  }

  return {
    tagName: release.tag_name,
    name: typeof release.name === 'string' ? release.name : undefined,
    htmlUrl: release.html_url,
    body: typeof release.body === 'string' ? release.body : undefined,
    publishedAt:
      typeof release.published_at === 'string' ? release.published_at : undefined,
    assets: Array.isArray(release.assets)
      ? release.assets.map(parseAsset).filter((a): a is UpdateAsset => a !== null)
      : [],
  }
}

function parseAsset(asset: unknown): UpdateAsset | null {
  if (!asset || typeof asset !== 'object') return null
  const a = asset as GitHubReleaseAsset
  if (typeof a.name !== 'string' || typeof a.browser_download_url !== 'string') {
    return null
  }
  return {
    name: a.name,
    downloadUrl: a.browser_download_url,
    contentType: typeof a.content_type === 'string' ? a.content_type : undefined,
    size: typeof a.size === 'number' ? a.size : undefined,
  }
}

export function selectPreferredAsset(
  assets: UpdateAsset[],
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): UpdateAsset | undefined {
  if (assets.length === 0) return undefined
  const names = assets.map((asset) => ({ asset, name: asset.name.toLowerCase() }))

  if (platform === 'darwin') {
    const archNeedle = arch === 'arm64' ? 'arm64' : 'x64'
    return (
      names.find(({ name }) => name.endsWith('.dmg') && name.includes(archNeedle))?.asset ??
      names.find(({ name }) => name.endsWith('.dmg'))?.asset ??
      names.find(({ name }) => name.endsWith('.zip'))?.asset
    )
  }

  if (platform === 'win32') {
    return names.find(({ name }) => name.endsWith('.exe') || name.endsWith('.msi'))?.asset
  }

  return names.find(({ name }) => name.endsWith('.appimage'))?.asset ?? assets[0]
}

export function normalizeVersion(version: string): string {
  const trimmed = version.trim()
  return trimmed.replace(/^v/i, '')
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  const length = Math.max(a.core.length, b.core.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  if (a.prerelease === b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease)
}

function parseVersion(version: string): { core: number[]; prerelease: string } {
  const clean = normalizeVersion(version).split('+')[0]
  const [coreText, prerelease = ''] = clean.split('-', 2)
  const core = coreText.split('.').map((part) => {
    const match = /^(\d+)/.exec(part)
    return match ? Number(match[1]) : 0
  })
  return { core, prerelease }
}

function readGitHubError(text: string): string | undefined {
  if (!text.trim()) return undefined
  try {
    const payload = JSON.parse(text) as { message?: unknown }
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return `检查更新失败: ${payload.message}`
    }
  } catch {
    // Fall through to the generic HTTP message.
  }
  return undefined
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
