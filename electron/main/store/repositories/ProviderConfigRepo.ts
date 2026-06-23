import type { DanmakuProvider, ProviderConfig } from '@shared/types/danmaku'
import type { DB } from '../db'

// Persisted danmaku provider configs (docs 05 provider_configs): enabled flag +
// auto-match priority, durable across sessions. Built-ins are seeded on first
// run; newly shipped built-ins seed without clobbering user overrides.

interface ProviderConfigRow {
  id: string
  manifest_id: string
  name: string
  enabled: number
  config_values: string
  sort_order: number
}

function toConfig(r: ProviderConfigRow): ProviderConfig {
  let configValues: Record<string, unknown>
  try {
    configValues = JSON.parse(r.config_values) as Record<string, unknown>
  } catch {
    configValues = {}
  }
  return {
    id: r.id,
    manifestId: r.manifest_id as DanmakuProvider,
    name: r.name,
    enabled: r.enabled !== 0,
    configValues,
    sortOrder: r.sort_order,
  }
}

export class ProviderConfigRepo {
  constructor(private readonly db: DB) {}

  /** All configs in auto-match priority order. */
  list(): ProviderConfig[] {
    return (
      this.db
        .prepare(`SELECT * FROM provider_configs ORDER BY sort_order ASC, id ASC`)
        .all() as ProviderConfigRow[]
    ).map(toConfig)
  }

  get(id: string): ProviderConfig | null {
    const row = this.db.prepare(`SELECT * FROM provider_configs WHERE id = ?`).get(id) as
      | ProviderConfigRow
      | undefined
    return row ? toConfig(row) : null
  }

  upsert(config: ProviderConfig): void {
    this.db
      .prepare(
        `INSERT INTO provider_configs (id, manifest_id, name, enabled, config_values, sort_order)
         VALUES (@id, @manifestId, @name, @enabled, @configValues, @sortOrder)
         ON CONFLICT(id) DO UPDATE SET
           manifest_id = @manifestId, name = @name, enabled = @enabled,
           config_values = @configValues, sort_order = @sortOrder`,
      )
      .run({
        id: config.id,
        manifestId: config.manifestId,
        name: config.name,
        enabled: config.enabled ? 1 : 0,
        configValues: JSON.stringify(config.configValues ?? {}),
        sortOrder: config.sortOrder,
      })
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db
      .prepare(`UPDATE provider_configs SET enabled = ? WHERE id = ?`)
      .run(enabled ? 1 : 0, id)
  }

  setSortOrder(id: string, sortOrder: number): void {
    this.db.prepare(`UPDATE provider_configs SET sort_order = ? WHERE id = ?`).run(sortOrder, id)
  }

  /** Insert any built-in configs not already present; leaves overrides intact. */
  seedDefaults(defaults: ProviderConfig[]): void {
    const insertMissing = this.db.transaction((rows: ProviderConfig[]) => {
      const exists = this.db.prepare(`SELECT 1 FROM provider_configs WHERE id = ?`)
      for (const row of rows) {
        if (!exists.get(row.id)) this.upsert(row)
      }
    })
    insertMissing(defaults)
  }
}
