# 01 · 架构总览

## 1.1 进程模型

Electron 三类执行环境,职责严格分离:

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (Chromium + React)  ——  纯 UI,无外部网络             │
│  · 资源库浏览 / 搜索 / 详情 / 播放页 / 弹幕设置                  │
│  · 弹幕渲染层(Canvas 或透明叠加)                              │
│  · 仅通过 preload 暴露的 typed IPC 与 Main 通信                 │
└───────────────┬──────────────────────────────────────────────┘
                │ contextBridge (typed, 白名单 channel)
┌───────────────┴──────────────────────────────────────────────┐
│ Preload  ——  安全桥(contextIsolation: true, nodeIntegration:off)│
│  · 暴露 window.api.{emby, danmaku, player, store} 等命名空间     │
└───────────────┬──────────────────────────────────────────────┘
                │ ipcMain.handle / webContents.send
┌───────────────┴──────────────────────────────────────────────┐
│ Main (Node)  ——  有权限的执行层                                 │
│  EmbyService · DanmakuService · PlayerController · StoreService │
│  ManifestRegistry · ManifestRunner · FetchLike                 │
│  session.cookies / webRequest.onBeforeSendHeaders              │
│  better-sqlite3 · safeStorage(Keychain)                        │
└───────────────┬───────────────────────────┬──────────────────┘
                │                            │
        外部 HTTP(Emby / 弹幕平台)      libmpv(原生子进程/addon)
```

**铁律:Renderer 永不直接发外部请求。** 原因(对应弹幕方案文档第 11 节):
1. 绕过 CORS。
2. 能设置 `Referer` / `Origin` / `Cookie` 等浏览器禁止的 forbidden headers(B 站/腾讯必需)。
3. AccessToken / cookie 不进入页面上下文,降低 XSS 泄露面。

## 1.2 模块划分(Main 进程)

| 模块 | 职责 | 依赖 |
|---|---|---|
| `EmbyService` | 多服务器认证、Items/搜索/图片/PlaybackInfo/进度回报 | FetchLike, StoreService |
| `DeviceProfileBuilder` | 按当前播放引擎能力生成 DeviceProfile | PlayerCapabilities |
| `PlayerController` | 控制 mpv:load/play/pause/seek/状态事件 | libmpv |
| `DanmakuService` | 匹配编排、拉取、缓存、转 ASS | ManifestRunner, MatchService, Store |
| `MatchService` | dandanplay /match 自动匹配 + 映射记忆 | FetchLike, Store |
| `ManifestRegistry` | 拉取 catalog、下载/校验/构建 runner、热更新 | FetchLike, Store |
| `ManifestRunner` | 执行 search/episodes/danmaku pipeline | FetchLike |
| `FetchLike` | 统一网络层:header rewrite / cookie / JSON·XML·protobuf / 节流 | session |
| `CookieAuthService` | 开窗登录 B 站/腾讯,复用 session cookie | BrowserWindow, session |
| `StoreService` | SQLite 读写封装(repository 模式) | better-sqlite3 |
| `SecretService` | Keychain 存取 token/敏感配置 | safeStorage |

## 1.3 目录结构

按功能/领域组织(不按文件类型),单文件 200–400 行,上限 800。

```
danmaku-emby/
├── electron/
│   ├── main/
│   │   ├── index.ts                 # app 启动、窗口、IPC 注册入口
│   │   ├── ipc/                      # IPC handler(薄,转调 service)
│   │   │   ├── emby.ipc.ts
│   │   │   ├── danmaku.ipc.ts
│   │   │   ├── player.ipc.ts
│   │   │   └── channels.ts          # channel 常量 + 请求/响应类型
│   │   ├── emby/
│   │   │   ├── EmbyService.ts
│   │   │   ├── DeviceProfileBuilder.ts
│   │   │   └── types.ts
│   │   ├── player/
│   │   │   ├── PlayerController.ts
│   │   │   ├── mpv/                  # libmpv 绑定 / IPC client
│   │   │   └── PlayerEngine.ts       # 抽象接口(mpv / html5 两实现)
│   │   ├── danmaku/
│   │   │   ├── DanmakuService.ts
│   │   │   ├── MatchService.ts
│   │   │   ├── manifest/
│   │   │   │   ├── ManifestRegistry.ts
│   │   │   │   ├── ManifestRunner.ts
│   │   │   │   └── schema.ts
│   │   │   ├── net/
│   │   │   │   ├── FetchLike.ts
│   │   │   │   ├── headerRewrite.ts
│   │   │   │   ├── cookieJar.ts
│   │   │   │   └── decoders/         # xml / protobuf
│   │   │   └── render/
│   │   │       └── toAss.ts          # {p,m} → ASS
│   │   ├── store/
│   │   │   ├── db.ts                 # 连接 + migration
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   └── secret/SecretService.ts
│   └── preload/
│       └── index.ts                 # contextBridge 暴露 typed api
├── src/                             # Renderer (React)
│   ├── features/
│   │   ├── servers/                 # 服务器添加/切换
│   │   ├── library/                 # 资源库浏览
│   │   ├── search/
│   │   ├── detail/                  # 剧集/电影详情
│   │   ├── player/                  # 播放页 + 弹幕叠加层
│   │   └── danmaku-match/           # 手动匹配 UI
│   ├── components/ui/
│   ├── hooks/
│   ├── lib/
│   │   └── ipc.ts                   # 对 window.api 的 typed 封装 + TanStack Query
│   └── styles/
├── shared/
│   └── types/                       # Main 与 Renderer 共享的领域类型
├── manifests/                       # 内置兜底 manifest(catalog 不可用时)
├── docs/system-design/
└── package.json
```

## 1.4 IPC 契约

所有 channel 在 `channels.ts` 集中定义,Main 用 `ipcMain.handle`,Renderer 经 preload 调 `invoke`。请求/响应统一信封(对照通用 patterns 的 API 响应格式):

```ts
// shared/types/ipc.ts
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

// channels.ts —— 部分示例
export const CH = {
  // Emby
  EMBY_ADD_SERVER:   'emby:addServer',     // (input: ServerInput) => Server
  EMBY_LIST_SERVERS: 'emby:listServers',   // () => Server[]
  EMBY_VIEWS:        'emby:views',         // (serverId) => Library[]
  EMBY_ITEMS:        'emby:items',         // (ItemsQuery) => Page<Item>
  EMBY_SEARCH:       'emby:search',        // (SearchQuery) => Page<Item>
  EMBY_PLAYBACK_INFO:'emby:playbackInfo',  // (itemId) => PlaybackSource
  EMBY_PROGRESS:     'emby:progress',      // (ProgressReport) => void
  // Player
  PLAYER_LOAD:       'player:load',        // (PlaybackSource) => void
  PLAYER_CMD:        'player:cmd',         // (PlayerCommand) => void
  PLAYER_STATE:      'player:state',       // event: Main → Renderer (push)
  // Danmaku
  DM_AUTO_MATCH:     'danmaku:autoMatch',  // (DanmakuMatchInput) => DanmakuTrack | null
  DM_SEARCH:         'danmaku:search',     // (provider, keyword) => Season[]
  DM_EPISODES:       'danmaku:episodes',   // (provider, seasonIds) => Episode[]
  DM_FETCH:          'danmaku:fetch',      // (provider, episodeIds) => DanmakuTrack
  DM_PROVIDERS:      'danmaku:listProviders',
} as const
```

事件类(Main 主动推送):播放状态 `PLAYER_STATE`、弹幕流式到达 `DM_CHUNK`、manifest 更新提示 `DM_MANIFEST_UPDATE` 用 `webContents.send`,Renderer 用 `ipcRenderer.on` 订阅。

## 1.5 状态管理(Renderer)

对照 web patterns「服务端状态与客户端状态分离」:

| 关注点 | 工具 |
|---|---|
| 服务端数据(Emby 列表/详情、弹幕搜索结果) | **TanStack Query**(经 IPC 取数,天然 SWR 缓存) |
| 客户端 UI 状态(播放器 UI、弹幕开关/透明度/字号) | **Zustand** |
| 路由状态(当前库/筛选/搜索词) | URL search params |

不把服务端数据复制进客户端 store;弹幕开关等 UI 偏好持久化到 SQLite(经 IPC)。

## 1.6 错误处理与可观测性

- IPC 层统一 try/catch → `IpcResult`,错误 `code` 枚举化(`EMBY_AUTH_FAILED` / `DM_NOT_LOGGED_IN` / `DM_REGION_BLOCKED` / `DM_RATE_LIMITED` / `PLAYER_LOAD_FAILED` …),UI 据 code 显示友好文案。
- Main 进程结构化日志(电平 + 模块 + 上下文),写文件 + 开发期控制台。
- 永不静默吞错;弹幕拉取失败时回退本地缓存(见 05)。
