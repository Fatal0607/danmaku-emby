import type { DB } from '../db'

// Single-row key/value repos: app_meta (app-level metadata) and preferences
// (JSON-encoded user prefs). Both validate JSON at the boundary (docs 05 §5.3).

export class AppMetaRepo {
  constructor(private readonly db: DB) {}

  get(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM app_meta WHERE key = ?`).get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (@key, @value)
         ON CONFLICT(key) DO UPDATE SET value = @value`,
      )
      .run({ key, value })
  }

  /** Read deviceId, generating + persisting one on first run. */
  ensureDeviceId(generate: () => string): string {
    const existing = this.get('deviceId')
    if (existing) return existing
    const id = generate()
    this.set('deviceId', id)
    return id
  }
}

export class PreferencesRepo {
  constructor(private readonly db: DB) {}

  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare(`SELECT value FROM preferences WHERE key = ?`).get(key) as
      | { value: string }
      | undefined
    if (!row) return fallback
    try {
      return JSON.parse(row.value) as T
    } catch {
      return fallback
    }
  }

  set<T>(key: string, value: T): void {
    this.db
      .prepare(
        `INSERT INTO preferences (key, value) VALUES (@key, @value)
         ON CONFLICT(key) DO UPDATE SET value = @value`,
      )
      .run({ key, value: JSON.stringify(value) })
  }
}
