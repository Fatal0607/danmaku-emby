# 05 · 数据模型与持久化

## 5.1 存储分层

| 数据 | 位置 | 理由 |
|---|---|---|
| AccessToken、appSecret 等敏感项 | **macOS Keychain(safeStorage)** | 不明文落盘(见 06) |
| 服务器元信息、provider 配置、弹幕缓存、匹配映射、UI 偏好 | **SQLite(better-sqlite3)** | 结构化查询、事务、可移植 |
| Emby 列表/详情 | 不持久化,Renderer TanStack Query 内存缓存 | SWR,数据易变 |
| manifest / catalog | SQLite + `manifests/` 内置兜底 | 离线可用 |

DB 文件:`app.getPath('userData')/danmaku-emby.db`。启动跑 migration(`store/migrations/`,版本号递增)。

## 5.2 表结构

```sql
-- 应用级元信息(单行 kv)
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);  -- deviceId、schemaVersion 等

-- Emby 服务器(token 不存这里,存 Keychain,键为 server.id)
CREATE TABLE servers (
  id          TEXT PRIMARY KEY,   -- Emby ServerId
  name        TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  username    TEXT NOT NULL,
  last_used   INTEGER,            -- epoch ms
  created_at  INTEGER NOT NULL
);

-- 弹幕源 provider 配置(对应方案文档 5.1)
CREATE TABLE provider_configs (
  id            TEXT PRIMARY KEY,
  manifest_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  config_values TEXT NOT NULL DEFAULT '{}',  -- JSON
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- manifest 缓存
CREATE TABLE manifests (
  manifest_id TEXT PRIMARY KEY,
  version     TEXT NOT NULL,
  api_version INTEGER NOT NULL,
  json        TEXT NOT NULL,      -- 完整 manifest
  updated_at  INTEGER NOT NULL
);

-- 弹幕缓存(对应方案文档第 10 节)
CREATE TABLE danmaku_cache (
  provider           TEXT NOT NULL,
  provider_config_id TEXT NOT NULL,
  season_id          TEXT NOT NULL,
  indexed_id         TEXT NOT NULL,   -- 平台内集标识
  comments           TEXT NOT NULL,   -- JSON: CommentEntity[]
  comment_count      INTEGER NOT NULL,
  last_checked       INTEGER NOT NULL,
  PRIMARY KEY (provider, season_id, indexed_id)
);

-- Emby 条目 → 弹幕集 映射记忆(匹配核心)
CREATE TABLE danmaku_map (
  emby_item_id   TEXT NOT NULL,
  server_id      TEXT NOT NULL,
  provider       TEXT NOT NULL,
  season_id      TEXT NOT NULL,
  indexed_id     TEXT NOT NULL,    -- episodeId/vid/cid…
  source         TEXT NOT NULL,    -- 'auto' | 'manual'
  matched_at     INTEGER NOT NULL,
  PRIMARY KEY (emby_item_id, server_id)
);

-- 用户偏好(弹幕渲染等)
CREATE TABLE preferences (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON
);

CREATE INDEX idx_danmaku_cache_checked ON danmaku_cache(last_checked);
CREATE INDEX idx_danmaku_map_server    ON danmaku_map(server_id);
```

## 5.3 Repository 模式

每张表一个 repo(`store/repositories/`),业务依赖接口而非 SQL:

```ts
interface DanmakuCacheRepo {
  find(provider: string, seasonId: string, indexedId: string): DanmakuTrack | null
  upsert(track: DanmakuTrack): void
  pruneOlderThan(epochMs: number): number
}
interface DanmakuMapRepo {
  get(serverId: string, embyItemId: string): DanmakuMapping | null
  put(m: DanmakuMapping): void
  bySeries(serverId: string, provider: string, seasonId: string): DanmakuMapping[]
}
```

写操作走事务;所有外部数据(API 响应)入库前校验(schema)。

## 5.4 偏好默认值(preferences)

```ts
interface DanmakuRenderPrefs {
  enabled: boolean        // true
  opacity: number         // 0.0–1.0, 默认 0.85
  fontSize: number        // px, 默认 24
  speed: number           // 滚动时长系数, 默认 1.0
  area: 'top' | 'half' | 'full'  // 显示区域, 默认 'full'
  density: number         // 最大同屏弹幕密度, 默认 1.0
  hideMode: ('scroll'|'top'|'bottom')[]  // 屏蔽类型, 默认 []
  blockKeywords: string[] // 关键词屏蔽, 默认 []
}
interface PlaybackPrefs {
  engine: 'mpv' | 'html5'   // 默认 'mpv'(回退 'html5')
  hwdec: boolean            // 默认 true
  maxBitrate: number        // 默认 1_000_000_000(直通)
}
```

## 5.5 缓存策略

- **弹幕缓存**:命中即用(方案文档 10);`forceUpdate` 或 `lastChecked` 超过 TTL(如 7 天)才重拉。
- **容量控制**:`danmaku_cache` 按 `last_checked` LRU 修剪,设上限(如 5000 条目)。
- **失效兜底**:重拉失败时保留旧缓存继续播放,UI 仅提示"使用缓存弹幕"。
- **映射记忆**:`manual` 来源永不被 `auto` 覆盖。

## 5.6 数据流(写路径)

```
登录成功      → servers.upsert + Keychain.set(server.id, token)
首次启动      → provider_configs seedDefaults + manifests 下载入库
自动匹配命中  → danmaku_map.put(source=auto)
手动匹配确认  → danmaku_map.put(source=manual, 覆盖)
拉到弹幕      → danmaku_cache.upsert
改弹幕设置    → preferences.put('danmakuRender', ...)
```
