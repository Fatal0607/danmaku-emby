import type { Database } from 'better-sqlite3'

// Versioned migrations (docs 05 §5.2). Each entry runs once, in order; the
// applied version is tracked in app_meta.schemaVersion.

export interface Migration {
  version: number
  up: (db: Database) => void
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        -- app_meta is bootstrapped by the migration runner (db.ts) so it can
        -- track schemaVersion; guard against the double-create on a fresh DB.
        CREATE TABLE IF NOT EXISTS app_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE servers (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          base_url    TEXT NOT NULL,
          user_id     TEXT NOT NULL,
          username    TEXT NOT NULL,
          last_used   INTEGER,
          created_at  INTEGER NOT NULL
        );

        CREATE TABLE provider_configs (
          id            TEXT PRIMARY KEY,
          manifest_id   TEXT NOT NULL,
          name          TEXT NOT NULL,
          enabled       INTEGER NOT NULL DEFAULT 1,
          config_values TEXT NOT NULL DEFAULT '{}',
          sort_order    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE manifests (
          manifest_id TEXT PRIMARY KEY,
          version     TEXT NOT NULL,
          api_version INTEGER NOT NULL,
          json        TEXT NOT NULL,
          updated_at  INTEGER NOT NULL
        );

        CREATE TABLE danmaku_cache (
          provider           TEXT NOT NULL,
          provider_config_id TEXT NOT NULL,
          season_id          TEXT NOT NULL,
          indexed_id         TEXT NOT NULL,
          comments           TEXT NOT NULL,
          comment_count      INTEGER NOT NULL,
          last_checked       INTEGER NOT NULL,
          PRIMARY KEY (provider, season_id, indexed_id)
        );

        CREATE TABLE danmaku_map (
          emby_item_id   TEXT NOT NULL,
          server_id      TEXT NOT NULL,
          provider       TEXT NOT NULL,
          season_id      TEXT NOT NULL,
          indexed_id     TEXT NOT NULL,
          source         TEXT NOT NULL,
          matched_at     INTEGER NOT NULL,
          PRIMARY KEY (emby_item_id, server_id)
        );

        CREATE TABLE preferences (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX idx_danmaku_cache_checked ON danmaku_cache(last_checked);
        CREATE INDEX idx_danmaku_map_server    ON danmaku_map(server_id);
      `)
    },
  },
]

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1].version
