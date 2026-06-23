# DanmakuEmby — 开发交接文档 (Handoff)

> 给下一个 agent 会话的自包含上下文。先读 `docs/system-design/`(设计方案 01–08) +
> 本文件,再读 `README.md`。所有改动遵循 `~/.claude/rules`(中文注释非强制,代码注释沿用英文以匹配现有风格)。

## 1. 项目是什么

自建 **Emby 客户端 + B站式弹幕叠加**,影院深色 + 玻璃拟态的 macOS 桌面应用。
技术栈(已按设计文档 07 落地):**Electron + Vite + React + TypeScript + TanStack Query + Zustand +
better-sqlite3 + safeStorage(Keychain)**;播放引擎计划用 **libmpv**(尚未接原生);弹幕渲染 mpv→ASS(L1)。

## 2. 运行 / 验证

```bash
npm install          # 会编译 better-sqlite3 原生模块(需 macOS 工具链)
npm run dev          # Vite 浏览器预览(走 mock 数据,无需 Electron)
npm run electron:dev # 构建并启动 Electron 窗口(真实 IPC)
npm run build        # tsc --noEmit + vite build
npm test             # Vitest 单元测试(当前 79 通过 / 8 跳过)
```

真实平台冒烟测试默认跳过,凭据从环境变量读取(**绝不硬编码**):

```bash
# Emby(已验证通过):
EMBY_ADDRESS=... EMBY_USERNAME=... EMBY_PASSWORD=... npx vitest run tests/smoke/emby.smoke.test.ts
# dandanplay(需开发者 AppId 或自建签名 proxy):
DDP_APP_ID=... DDP_APP_SECRET=... npx vitest run tests/smoke/dandanplay.smoke.test.ts
# bilibili(公开 nav+WBI,有风控,opt-in):
BILI_SMOKE=1 npx vitest run tests/smoke/bilibili.smoke.test.ts
```

## 3. 已完成 ✅

| 模块 | 状态 | 关键提交 |
|---|---|---|
| 渲染层 UI 9 屏 + 设计系统(tokens) | ✅ 完整,浏览器预览验证 | `7ace54f` |
| Main 骨架:Emby 集成 + SQLite + Keychain + 安全 IPC + toAss + DeviceProfileBuilder | ✅ 实现+单测 | `4dbbefd` |
| TanStack Query 数据层 + 屏幕接 IPC(mock 回退) | ✅ 实现,预览验证 | `f372fd6` |
| **真实 Emby 服务器端到端验证**(认证→浏览→PlaybackInfo directPlay) | ✅ 冒烟通过(OkEmby 4.9.1.90, 9647 条目, 2160p mkv 走 directPlay) | smoke |
| 弹幕 Phase 2:dandanplay provider(AppId 签名)+ MatchService + DanmakuService(缓存/手动覆盖/兜底)+ IPC | ✅ 实现+单测 | `0f67c62` |
| 弹幕 Phase 3:bilibili provider(WBI 签名 + XML 解码) | ✅ 实现+单测(WBI 对线上 nav 验证) | `ea0d85b` |
| 多 provider registry(dandanplay+bilibili 按优先级路由) | ✅ 实现+单测 | `926f697` |
| **渲染层接弹幕 IPC**:DanmakuSource(Electron/mock 回退)+ TanStack Query hooks + 播放器时间同步叠加 + 手动匹配(搜索→剧集→fetchManual)+ 设置/字幕真实条数 | ✅ 实现,浏览器预览端到端验证(tsc+58 单测+build 通过) | 本次 |
| **腾讯视频 provider**:MbSearch 搜索 + GetPageData 剧集(过滤预告)+ barrage segment 弹幕解码(ms→s、gradient/color→十进制)+ registry sortOrder 2 | ✅ 实现+单测(15 例),tsc+全量 73 单测+build 通过 | 本次 |
| **provider_configs 持久化**:ProviderConfigRepo(seed/开关/排序,真实 :memory: DB 单测)+ registry 可运行时变更 + IPC(listConfigs/setEnabled/reorder)+ 设置页「弹幕来源」开关与上下移 | ✅ 实现+单测(6 例),浏览器预览端到端(开关→匹配弹窗联动),全量 79 单测+build 通过 | 本次 |
| 修复冷启动 bug:migration v1 重复建 `app_meta`(db.ts 已 bootstrap)导致新库 openDatabase 抛错 → 改 `IF NOT EXISTS` | ✅ 由 ProviderConfigRepo 单测暴露并修复 | 本次 |

**关键验证事实**:
- Emby 集成对真实生产服务器有效;2160p mkv 经宽松 DeviceProfile 走 **directPlay(非转码)**,印证"根治无声"路径。
- bilibili WBI `getMixinKey` 对线上 nav 返回的 img/sub key 推出 `ea1db124af3c7062474693fa704f4ff8`,签名算法正确。
- dandanplay 官方无签名返回 **403**,确认必须 AppId(或自建 proxy),与 docs 06 §6.2 一致。

## 4. 待做 ⬜(建议优先级)

1. ✅ **渲染层接弹幕 IPC**(已完成,本次)— `src/lib/danmakuSource.ts`(DanmakuSource:Electron `window.api.danmaku` 真实 / 浏览器 mock 回退)+ `src/lib/queries.ts` 新增 danmaku hooks(`useDanmakuTrack`/`useDanmakuSearch`/`useDanmakuEpisodes`/`useFetchManualDanmaku`)+ `src/lib/danmaku.ts`({p,m}→视图、provider 标签、十进制色)。`DanmakuLayer` 改为按 `time` 时间同步发射(seek 重置、密度门控),无 track 时回退 mock 流;`DanmakuMatch` 走真实 搜索→剧集→fetchManual 两级流;`DanmakuSettings`/字幕显示真实条数。浏览器预览端到端验证通过。
   - ⚠️ **遗留**:`Player.tsx` 的 `DanmakuMatchInput.fileName` 暂用 `item.title`(缺真实 PlaybackSource)。dandanplay 的精确 hash 匹配需要真实文件名/大小/时长,要等 **Spike A(libmpv)** 接通 `emby.playbackInfo` 返回的 `PlaybackSource.fileName/fileSize/runTimeTicks` 后回填;在此之前 auto-match 在真实环境可能落空,手动匹配流可兜底。
2. ✅ **腾讯视频 provider**(已完成,本次)— `electron/main/danmaku/providers/tencent/`(TencentProvider + types + mapping)+ `net/decoders/tencentDanmaku.ts`。搜索 `MultiTerminalSearch/MbSearch`(POST),剧集 `PageServer/GetPageData`(POST,过滤 `is_trailer`),弹幕 `barrage/base/{vid}` 取分段索引 → 并发 `barrage/segment/{vid}/{name}`,`time_offset`(ms)→秒、`content_style.gradient_colors[0]||color`→十进制色(白默认 16777215)。`match` 同 B站为 no-op(走手动搜索)。已加入 registry(sortOrder 2)。
   - ⚠️ **未做真实冒烟**:sandbox 无外网,只有 mock fetcher 单测。真机可跑 `TX_SMOKE=1 npx vitest run tests/smoke/tencent.smoke.test.ts` 验证线上(端点为公开 POST RPC,有风控)。固定参数体可能随腾讯版本变化,需以真实响应校准 `MbSearch`/`GetPageData` 的 body 与解析路径。
3. **Spike A:libmpv 原生绑定**(docs 03 §3.4, 07 §7.2)— **必须在真实 macOS + 原生环境做,sandbox 跑不了**。`electron/main/player/MpvEngine.ts` 是绑定点(目前 stub,`ensureConnected()` 抛错)。打通 JSON IPC(loadfile/pause/seek/observe time-pos),`loadAssOverlay` 显示弹幕。
4. **dandanplay 真实凭据/proxy** — 申请 AppId 或部署签名 proxy,填 `preferences.dandanplayConfig`。
5. ✅ **provider_configs 持久化**(已完成,本次)— `ProviderConfigRepo`(seed 内置默认、`setEnabled`/`setSortOrder`、`seedDefaults` 幂等且保留用户覆盖,真实 :memory: DB 单测)。`AppServices` 从 `provider_configs` 读出 enabled/order 构建 registry;`ProviderRegistry` 加 `setEnabled`/`setSortOrder` 运行时变更。新增 IPC `DM_LIST_CONFIGS`/`DM_SET_ENABLED`/`DM_REORDER` + preload 桥;`src/lib/danmakuSource.ts` 加 `listConfigs`/`setProviderEnabled`/`reorderProviders`(mock 用模块级可变状态),`queries.ts` 加 `useDanmakuConfigs`/`useSetProviderEnabled`/`useReorderProviders`;设置页「弹幕来源」改为真实开关+上下移排序。预览验证:关掉某源后匹配弹窗的跨源搜索即排除它。
   - 顺带修复冷启动 bug:migration v1 用 `CREATE TABLE app_meta`(无 IF NOT EXISTS),而 `db.ts` 已 bootstrap 同名表 → 新库 `openDatabase` 必抛错(应用无法冷启动)。改为 `CREATE TABLE IF NOT EXISTS`,由本次 repo 单测暴露。
   - 备注:`configValues` 已可持久化但暂未承载内容(dandanplay 凭据仍在 `preferences.dandanplayConfig`);未来按 provider 存配置可复用该字段。
6. **进度回报接 mpv** — `EmbyService.reportProgress` 已实现,需由 PlayerController 的 time-pos 事件节流驱动(start/progress/stop)。
7. **manifest 热更新**(docs 04 §4.3)、**E2E(Playwright)**、CookieAuthService(B站登录窗,docs 06 §6.3)。

## 5. 代码地图(关键路径)

```
electron/main/
├── AppServices.ts              # 组合根:Store+Secrets+EmbyService+DanmakuService(registry)
├── emby/EmbyService.ts         # 认证/浏览/搜索/PlaybackInfo→PlaybackSource/进度
├── emby/DeviceProfileBuilder.ts# 宽松 mpv profile → AC3/DTS/HEVC 直通
├── net/FetchLike.ts            # 可注入网络层(支持 rewriteHeaders/xml)
├── player/PlayerEngine.ts      # 引擎接口 + mpv/html5 能力集
├── player/MpvEngine.ts         # ⬜ libmpv 绑定点(stub,待 Spike A)
├── danmaku/
│   ├── DanmakuService.ts       # 编排:autoMatch→缓存优先 getDanmaku→toAss,按 provider 路由
│   ├── MatchService.ts         # /match + 映射记忆(manual 覆盖) + extrapolateEpisodeId
│   ├── ProviderRegistry.ts     # 多源 registry(enabled/优先级,可运行时 setEnabled/setSortOrder)
│   ├── providers/defaults.ts   # 内置 provider 默认配置(seed 用)
│   ├── providers/dandanplay/   # provider + AppId 签名 + 映射
│   ├── providers/bilibili/     # provider + WBI 签名 + 映射
│   ├── providers/tencent/      # provider + 映射(MbSearch/GetPageData)
│   ├── net/decoders/biliXml.ts # B站 XML → 标准 {p,m}
│   ├── net/decoders/tencentDanmaku.ts # 腾讯 segment JSON → 标准 {p,m}
│   └── render/toAss.ts         # {p,m} → ASS(轨道分配,mpv L1)
├── store/                      # better-sqlite3 db + migrations + repositories(含 ProviderConfigRepo)
└── ipc/                        # registerEmbyIpc + registerDanmakuIpc(IpcResult 信封)

electron/preload/index.ts       # 白名单 typed bridge: window.api.{emby,danmaku}

src/
├── hooks/useDebouncedValue.ts  # 通用防抖(手动匹配搜索用)
├── lib/ipc.ts                  # IpcResult 解包 + isElectron()
├── lib/dataSource.ts           # DataSource 抽象(Emby IPC / 浏览器 mock)
├── lib/danmakuSource.ts        # DanmakuSource 抽象(danmaku IPC / 浏览器 mock)
├── lib/danmaku.ts              # {p,m}→视图弹幕、provider 标签、十进制色→hex
├── lib/queries.ts              # TanStack Query hooks(Emby + danmaku 均已接)
├── lib/mappers.ts              # EmbyItem→MediaItem, EmbyServer→Server
├── lib/mockData.ts             # 浏览器预览 mock(含 {p,m} mockDanmakuComments)
└── features/                   # 按界面分目录(player/ 含弹幕层+设置+手动匹配,均已接 IPC)

shared/types/                   # ipc(channels+信封)/emby/danmaku/domain — Main 与 Renderer 共享
```

## 6. 重要约束 / 注意事项

- **环境限制**:此前会话在 sandbox,**跑不起完整 Electron**(原生模块 + 窗口)。验证手段:`tsc --noEmit` + Vitest 单测 + 真实 HTTP 冒烟(纯逻辑/网络)。涉及 mpv/窗口/native 的部分必须在真实 macOS 上做。
- **better-sqlite3** 是原生模块:`package.json` 已列为依赖。多数 Vitest 单测用内存 fake repo 不依赖 sqlite native;但 `tests/providerConfig.test.ts` 用真实 `openDatabase(':memory:')`,需原生已编译(当前环境已可用)。真实机器 `npm install` 会编译。
- **安全**:Emby token 经 safeStorage 加密存 Keychain,SQLite 不存明文;密码仅登录时内存使用。dandanplay appSecret/B站 cookie **绝不入客户端**(proxy 代签 / 用户登录窗)。Renderer 无外网能力,全部外部请求在 Main。
- ⚠️ **凭据轮换**:上游会话中用户曾在对话里明文贴过其真实 Emby 账号密码用于冒烟验证(未写入任何文件/提交)。**应提醒用户轮换该 Emby 密码**。
- **provider id 类型**:`shared/types/danmaku.ts` 的 `DanmakuProvider` 是 union(`'dandanplay'|'bilibili'|'tencent'`),与 `providers/DanmakuProvider.ts` 的 interface `DanmakuSourceProvider` 不要混淆。
- **mock 回退**:渲染层所有数据走 `DataSource`/queries,浏览器无 `window.api` 时自动 mock,保证预览常绿。新接的弹幕 UI 也要遵循这个回退模式。
- **提交规范**:conventional commits;全局禁用 attribution(不加 Co-Authored-By);`dist/`、`node_modules/`、`.claude/` 已 gitignore。

## 7. 一句话状态

UI(9 屏)+ Emby 集成(真实验证)+ 弹幕逻辑层(dandanplay/bilibili/腾讯三源、匹配、缓存、ASS、多源路由)+ 弹幕已接入播放器 UI(时间同步叠加、手动匹配两级流)+ **provider_configs 持久化(设置页开关/排序,registry 运行时联动)** 均已完成且单测覆盖(79 通过)。
**下一步**:剩余多为真机/原生任务 —— 在真实 macOS 打通 **libmpv(Spike A)** 让弹幕真正叠加显示并回填真实 PlaybackSource 给 auto-match;进度回报接 mpv;dandanplay 真实凭据/proxy;腾讯/E2E 真机冒烟。纯逻辑可继续做的:manifest 热更新(docs 04 §4.3)。
