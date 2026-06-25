export interface UpdateAsset {
  name: string
  downloadUrl: string
  contentType?: string
  size?: number
}

export interface UpdateCurrentInfo {
  currentVersion: string
  repository: string
  releasePageUrl: string
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  isPackaged: boolean
}

export interface UpdateCheckResult extends UpdateCurrentInfo {
  latestVersion: string
  releaseName?: string
  releaseUrl: string
  releaseNotes?: string
  publishedAt?: string
  updateAvailable: boolean
  assets: UpdateAsset[]
  preferredAsset?: UpdateAsset
}
