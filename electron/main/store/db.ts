import Database from 'better-sqlite3'
import { LATEST_SCHEMA_VERSION, migrations } from './migrations'

// SQLite connection + migration runner (docs 05 §5.1). DB lives at
// app.getPath('userData')/danmaku-emby.db; the path is injected so tests can
// use ':memory:'.

export type DB = Database.Database

export function openDatabase(filePath: string): DB {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function runMigrations(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  const current = getSchemaVersion(db)
  const pending = migrations.filter((m) => m.version > current)
  if (!pending.length) return

  const apply = db.transaction(() => {
    for (const m of pending) {
      m.up(db)
      setSchemaVersion(db, m.version)
    }
  })
  apply()
}

function getSchemaVersion(db: DB): number {
  const row = db
    .prepare(`SELECT value FROM app_meta WHERE key = 'schemaVersion'`)
    .get() as { value: string } | undefined
  return row ? Number(row.value) : 0
}

function setSchemaVersion(db: DB, version: number): void {
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES ('schemaVersion', @v)
     ON CONFLICT(key) DO UPDATE SET value = @v`,
  ).run({ v: String(version) })
}

export { LATEST_SCHEMA_VERSION }
