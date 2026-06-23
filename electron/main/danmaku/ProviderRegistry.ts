import type { DanmakuProvider as ProviderId } from '@shared/types/danmaku'
import type { DanmakuSourceProvider } from './providers/DanmakuProvider'

// Registry of danmaku providers (docs 04 §4.3). Holds each provider with its
// enabled flag and priority so DanmakuService can route by id and try
// auto-match across sources in order.

export interface RegisteredProvider {
  provider: DanmakuSourceProvider
  enabled: boolean
  sortOrder: number
}

export interface ProviderInfo {
  id: ProviderId
  enabled: boolean
  sortOrder: number
}

export class ProviderRegistry {
  private entries: RegisteredProvider[]

  constructor(entries: RegisteredProvider[]) {
    this.entries = this.sorted(entries)
  }

  /** An enabled provider by id, or undefined if absent/disabled. */
  get(id: ProviderId): DanmakuSourceProvider | undefined {
    return this.entries.find((e) => e.provider.id === id && e.enabled)?.provider
  }

  /** Enabled providers, highest priority first. */
  enabledByPriority(): DanmakuSourceProvider[] {
    return this.entries.filter((e) => e.enabled).map((e) => e.provider)
  }

  list(): ProviderInfo[] {
    return this.entries.map((e) => ({
      id: e.provider.id,
      enabled: e.enabled,
      sortOrder: e.sortOrder,
    }))
  }

  /** Toggle a provider on/off at runtime (mirrors the persisted config). */
  setEnabled(id: ProviderId, enabled: boolean): void {
    const entry = this.entries.find((e) => e.provider.id === id)
    if (entry) entry.enabled = enabled
  }

  /** Update a provider's priority and re-sort. */
  setSortOrder(id: ProviderId, sortOrder: number): void {
    const entry = this.entries.find((e) => e.provider.id === id)
    if (!entry) return
    entry.sortOrder = sortOrder
    this.entries = this.sorted(this.entries)
  }

  private sorted(entries: RegisteredProvider[]): RegisteredProvider[] {
    return [...entries].sort((a, b) => a.sortOrder - b.sortOrder)
  }
}
