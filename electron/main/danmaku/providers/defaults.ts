import type { ProviderConfig } from '@shared/types/danmaku'

// Built-in provider configs seeded into the DB on first run (docs 05
// provider_configs). `id === manifestId` for now (one config per provider); the
// registry instantiates the matching provider by `manifestId`. Users can toggle
// `enabled` and reorder `sortOrder` from the settings page, and those overrides
// persist while new built-ins added here seed automatically.

export const DEFAULT_PROVIDER_CONFIGS: ProviderConfig[] = [
  { id: 'dandanplay', manifestId: 'dandanplay', name: '弹弹play', enabled: true, configValues: {}, sortOrder: 0 },
  { id: 'bilibili', manifestId: 'bilibili', name: '哔哩哔哩', enabled: true, configValues: {}, sortOrder: 1 },
  { id: 'tencent', manifestId: 'tencent', name: '腾讯视频', enabled: true, configValues: {}, sortOrder: 2 },
]
