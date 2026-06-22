import type { EmbyServer } from '@shared/types/emby'
import type { DB } from '../db'

interface ServerRow {
  id: string
  name: string
  base_url: string
  user_id: string
  username: string
  last_used: number | null
  created_at: number
}

const toServer = (r: ServerRow): EmbyServer => ({
  id: r.id,
  name: r.name,
  baseUrl: r.base_url,
  userId: r.user_id,
  username: r.username,
  lastUsed: r.last_used ?? undefined,
  createdAt: r.created_at,
})

export class ServerRepo {
  constructor(private readonly db: DB) {}

  list(): EmbyServer[] {
    return (
      this.db
        .prepare(`SELECT * FROM servers ORDER BY last_used DESC, created_at DESC`)
        .all() as ServerRow[]
    ).map(toServer)
  }

  get(id: string): EmbyServer | null {
    const row = this.db.prepare(`SELECT * FROM servers WHERE id = ?`).get(id) as
      | ServerRow
      | undefined
    return row ? toServer(row) : null
  }

  upsert(server: EmbyServer): void {
    this.db
      .prepare(
        `INSERT INTO servers (id, name, base_url, user_id, username, last_used, created_at)
         VALUES (@id, @name, @baseUrl, @userId, @username, @lastUsed, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           name = @name, base_url = @baseUrl, user_id = @userId,
           username = @username, last_used = @lastUsed`,
      )
      .run({
        id: server.id,
        name: server.name,
        baseUrl: server.baseUrl,
        userId: server.userId,
        username: server.username,
        lastUsed: server.lastUsed ?? Date.now(),
        createdAt: server.createdAt,
      })
  }

  touch(id: string): void {
    this.db.prepare(`UPDATE servers SET last_used = ? WHERE id = ?`).run(Date.now(), id)
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM servers WHERE id = ?`).run(id)
  }
}
