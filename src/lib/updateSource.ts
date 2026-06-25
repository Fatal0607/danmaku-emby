import type { UpdateCheckResult, UpdateCurrentInfo } from '@shared/types/update'
import { getApi, isElectron, unwrap } from './ipc'

export interface UpdateSource {
  current(): Promise<UpdateCurrentInfo>
  checkForUpdates(): Promise<UpdateCheckResult>
  openReleasePage(url?: string): Promise<void>
}

class ElectronUpdateSource implements UpdateSource {
  current(): Promise<UpdateCurrentInfo> {
    return unwrap(getApi().update.current())
  }

  checkForUpdates(): Promise<UpdateCheckResult> {
    return unwrap(getApi().update.checkForUpdates())
  }

  openReleasePage(url?: string): Promise<void> {
    return unwrap(getApi().update.openReleasePage(url))
  }
}

class MockUpdateSource implements UpdateSource {
  async current(): Promise<UpdateCurrentInfo> {
    return {
      currentVersion: '0.1.0',
      repository: 'Fatal0607/danmaku-emby',
      releasePageUrl: 'https://github.com/Fatal0607/danmaku-emby/releases',
      platform: 'darwin',
      arch: 'arm64',
      isPackaged: false,
    }
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    return {
      ...(await this.current()),
      latestVersion: '0.1.0',
      releaseUrl: 'https://github.com/Fatal0607/danmaku-emby/releases',
      updateAvailable: false,
      assets: [],
    }
  }

  async openReleasePage(url?: string): Promise<void> {
    window.open(url ?? 'https://github.com/Fatal0607/danmaku-emby/releases', '_blank')
  }
}

let cached: UpdateSource | null = null

export function getUpdateSource(): UpdateSource {
  if (!cached) cached = isElectron() ? new ElectronUpdateSource() : new MockUpdateSource()
  return cached
}
