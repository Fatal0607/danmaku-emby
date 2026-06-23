import { openDatabase, type DB } from './db'
import { ServerRepo } from './repositories/ServerRepo'
import { AppMetaRepo, PreferencesRepo } from './repositories/KvRepos'
import { DanmakuCacheRepo, DanmakuMapRepo } from './repositories/DanmakuRepos'
import { ProviderConfigRepo } from './repositories/ProviderConfigRepo'

// Aggregates the repositories behind one handle (docs 05). Wired in Main at
// startup; pass a file path (or ':memory:' in tests).

export class Store {
  readonly db: DB
  readonly servers: ServerRepo
  readonly meta: AppMetaRepo
  readonly preferences: PreferencesRepo
  readonly danmakuMap: DanmakuMapRepo
  readonly danmakuCache: DanmakuCacheRepo
  readonly providerConfigs: ProviderConfigRepo

  constructor(filePath: string) {
    this.db = openDatabase(filePath)
    this.servers = new ServerRepo(this.db)
    this.meta = new AppMetaRepo(this.db)
    this.preferences = new PreferencesRepo(this.db)
    this.danmakuMap = new DanmakuMapRepo(this.db)
    this.danmakuCache = new DanmakuCacheRepo(this.db)
    this.providerConfigs = new ProviderConfigRepo(this.db)
  }

  close(): void {
    this.db.close()
  }
}
