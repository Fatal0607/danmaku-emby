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
npm run electron:dev # vite build + build:electron + rebuild:electron + 启动窗口(真机已验证可启动)
npm run build        # tsc --noEmit + vite build(渲染层)
npm run build:electron # esbuild 打包 main+preload → dist-electron/
npm test             # Vitest 单元测试(当前 91 通过 / 12 跳过;需 node ABI,见下)
# ⚠️ 跑 GUI 后 better-sqlite3 是 Electron ABI,要全量测先 `npm run rebuild:node`
```

真实平台冒烟测试默认跳过,凭据从环境变量读取(**绝不硬编码**):

```bash
# Emby(已验证通过):
EMBY_ADDRESS=... EMBY_USERNAME=... EMBY_PASSWORD=... npx vitest run tests/smoke/emby.smoke.test.ts
# dandanplay(需开发者 AppId 或自建签名 proxy):
DDP_APP_ID=... DDP_APP_SECRET=... npx vitest run tests/smoke/dandanplay.smoke.test.ts
# bilibili(公开 nav+WBI,有风控,opt-in):
BILI_SMOKE=1 npx vitest run tests/smoke/bilibili.smoke.test.ts
# 腾讯(公开 POST RPC,有风控,opt-in):
TX_SMOKE=1 npx vitest run tests/smoke/tencent.smoke.test.ts
# mpv 控制平面(需 brew install mpv;headless lavfi,opt-in):
MPV_SMOKE=1 npx vitest run tests/smoke/mpv.smoke.test.ts
```

> **原生依赖**:libmpv/播放需系统装 mpv(`brew install mpv`,本机已装 v0.41.0,
> `/opt/homebrew/bin/mpv`)。MpvEngine 默认调 PATH 里的 `mpv`,可注入 `binaryPath`。

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
| **Spike A:libmpv 控制平面(JSON IPC)** — MpvIpcClient(spawn mpv + unix socket + 请求/响应关联 + 事件)、MpvEngine(loadfile/pause/seek/observe time-pos/eof + ASS overlay)、纯协议编解码 | ✅ **真机验证通过**(mpv v0.41.0:loadfile→time-pos 推进→seek 20s 命中→sub-add ASS 得 track-list/count=2→MpvEngine emit timeupdate);协议单测 5 例 + opt-in 真机冒烟 3 例 | 本次 |
| **PlayerController + 播放 IPC + 进度回报(#6)** — 编排 resolvePlayback→engine.load→autoMatch 弹幕 ASS overlay→play;engine 事件→PLAYER_STATE 推送;time-pos 节流驱动 Emby start/progress/stop | ✅ 单测 7 例(含 stop 幂等竞态修复)+ 真机控制器冒烟(start,progress,stop 经真实 mpv)| 本次 |
| **Electron 构建管线** — `electron/build.mjs`(esbuild 把 main→ESM、preload→CJS 打进 `dist-electron/`,externalize electron+better-sqlite3)+ `rebuild:electron`/`rebuild:node`(native ABI 切换)+ `electron:dev` 串起来 | ✅ **真机启动验证**:app 干净启动(DB 打开、IPC 注册、窗口常驻、无报错);native ABI 修复(NODE_MODULE_VERSION 141↔128)| 本次 |

**关键验证事实**:
- Emby 集成对真实生产服务器有效;2160p mkv 经宽松 DeviceProfile 走 **directPlay(非转码)**,印证"根治无声"路径。
- bilibili WBI `getMixinKey` 对线上 nav 返回的 img/sub key 推出 `ea1db124af3c7062474693fa704f4ff8`,签名算法正确。
- dandanplay 官方无签名返回 **403**,确认必须 AppId(或自建 proxy),与 docs 06 §6.2 一致。

## 4. 待做 ⬜(建议优先级)

1. ✅ **渲染层接弹幕 IPC**(已完成,本次)— `src/lib/danmakuSource.ts`(DanmakuSource:Electron `window.api.danmaku` 真实 / 浏览器 mock 回退)+ `src/lib/queries.ts` 新增 danmaku hooks(`useDanmakuTrack`/`useDanmakuSearch`/`useDanmakuEpisodes`/`useFetchManualDanmaku`)+ `src/lib/danmaku.ts`({p,m}→视图、provider 标签、十进制色)。`DanmakuLayer` 改为按 `time` 时间同步发射(seek 重置、密度门控),无 track 时回退 mock 流;`DanmakuMatch` 走真实 搜索→剧集→fetchManual 两级流;`DanmakuSettings`/字幕显示真实条数。浏览器预览端到端验证通过。
   - ⚠️ **遗留**:`Player.tsx` 的 `DanmakuMatchInput.fileName` 暂用 `item.title`(缺真实 PlaybackSource)。dandanplay 的精确 hash 匹配需要真实文件名/大小/时长,要等 **Spike A(libmpv)** 接通 `emby.playbackInfo` 返回的 `PlaybackSource.fileName/fileSize/runTimeTicks` 后回填;在此之前 auto-match 在真实环境可能落空,手动匹配流可兜底。
2. ✅ **腾讯视频 provider**(已完成,本次)— `electron/main/danmaku/providers/tencent/`(TencentProvider + types + mapping)+ `net/decoders/tencentDanmaku.ts`。搜索 `MultiTerminalSearch/MbSearch`(POST),剧集 `PageServer/GetPageData`(POST,过滤 `is_trailer`),弹幕 `barrage/base/{vid}` 取分段索引 → 并发 `barrage/segment/{vid}/{name}`,`time_offset`(ms)→秒、`content_style.gradient_colors[0]||color`→十进制色(白默认 16777215)。`match` 同 B站为 no-op(走手动搜索)。已加入 registry(sortOrder 2)。
   - ⚠️ **未做真实冒烟**:sandbox 无外网,只有 mock fetcher 单测。真机可跑 `TX_SMOKE=1 npx vitest run tests/smoke/tencent.smoke.test.ts` 验证线上(端点为公开 POST RPC,有风控)。固定参数体可能随腾讯版本变化,需以真实响应校准 `MbSearch`/`GetPageData` 的 body 与解析路径。
3. ✅ **Spike A:libmpv 控制平面**(已完成,本次,真机验证)— 采用 docs 03 §3.4 推荐的 **L1:进程 + JSON IPC** 路线(非 N-API addon)。`electron/main/player/mpv/protocol.ts`(纯编解码,可单测)+ `MpvIpcClient.ts`(spawn `mpv --input-ipc-server` + unix socket + request_id 关联 + 事件 re-emit)+ 重写 `MpvEngine.ts`(connect/load/play/pause/seek/setAudioTrack/setSubtitle + `loadAssOverlay` 写临时 .ass 后 `sub-add select`;observe time-pos/duration/pause/eof → emit timeupdate/pause/play/ended)。`--hwdec=videotoolbox`。`MPV_SMOKE=1` 真机冒烟已过。
   - ⬜ **剩余(下一步,仍需真机/GUI)**:① **窗口嵌入**——目前 mpv 开自有窗口(L1);要 L2「子窗 + 透明叠加窗」(macOS `addChildWindow`)或 L3 render API 内嵌,才能把 HTML 控制条/弹幕叠到视频上。② **PlayerController + 播放 IPC** —— 用 `CH.PLAYER_LOAD/PLAYER_CMD/PLAYER_STATE` 把 MpvEngine 接到渲染层(替换 `Player.tsx` 的模拟播放头),`time-pos` 经 `PLAYER_STATE` 推 Renderer 驱动弹幕时间轴。③ 回填真实 `PlaybackSource` 给弹幕 auto-match(见 #1 遗留)。④ 进度回报(见 #6)。
4. **dandanplay 真实凭据/proxy** — 申请 AppId 或部署签名 proxy,填 `preferences.dandanplayConfig`。
5. ✅ **provider_configs 持久化**(已完成,本次)— `ProviderConfigRepo`(seed 内置默认、`setEnabled`/`setSortOrder`、`seedDefaults` 幂等且保留用户覆盖,真实 :memory: DB 单测)。`AppServices` 从 `provider_configs` 读出 enabled/order 构建 registry;`ProviderRegistry` 加 `setEnabled`/`setSortOrder` 运行时变更。新增 IPC `DM_LIST_CONFIGS`/`DM_SET_ENABLED`/`DM_REORDER` + preload 桥;`src/lib/danmakuSource.ts` 加 `listConfigs`/`setProviderEnabled`/`reorderProviders`(mock 用模块级可变状态),`queries.ts` 加 `useDanmakuConfigs`/`useSetProviderEnabled`/`useReorderProviders`;设置页「弹幕来源」改为真实开关+上下移排序。预览验证:关掉某源后匹配弹窗的跨源搜索即排除它。
   - 顺带修复冷启动 bug:migration v1 用 `CREATE TABLE app_meta`(无 IF NOT EXISTS),而 `db.ts` 已 bootstrap 同名表 → 新库 `openDatabase` 必抛错(应用无法冷启动)。改为 `CREATE TABLE IF NOT EXISTS`,由本次 repo 单测暴露。
   - 备注:`configValues` 已可持久化但暂未承载内容(dandanplay 凭据仍在 `preferences.dandanplayConfig`);未来按 provider 存配置可复用该字段。
6. ✅ **进度回报接 mpv**(已完成,本次)— `PlayerController` 在 `electron/main/player/PlayerController.ts`,由 `time-pos` 事件节流(默认 10s)驱动 `EmbyService.reportProgress` 的 start/progress/stop;暂停/结束/dispose 各自上报;stop 幂等(同步清 current 防竞态重复)。注入式依赖(PlaybackResolver/DanmakuOverlaySource/StateSender)便于单测。
7. **manifest 热更新**(docs 04 §4.3)、**E2E(Playwright)**、CookieAuthService(B站登录窗,docs 06 §6.3)。
8. ✅ **Electron 构建管线**(已完成,本次,真机启动验证)— `electron/build.mjs` 用 esbuild 把 `electron/main`→ESM(`dist-electron/main/index.js`)、`electron/preload`→CJS(`.cjs`)打包,externalize `electron`+`better-sqlite3`,alias `@shared`。脚本:`build:electron`、`rebuild:electron`(electron-rebuild)、`rebuild:node`(npm rebuild),`electron:dev = vite build && build:electron && rebuild:electron && electron .`。`app` 干净启动(DB/IPC/窗口均 OK)。
   - ⚠️ **native ABI 双轨**:`better-sqlite3` 是原生模块,Electron(ABI 128)与系统 Node(ABI 141,跑 Vitest)不兼容。约定:跑 GUI 用 `electron:dev`(自动 rebuild:electron);跑全量测试用 `npm run rebuild:node && npm test`。`tests/providerConfig.test.ts` 已加 `runIf(sqliteOk)` 守卫——ABI 不匹配时自动跳过(不崩),其余测试不受影响。默认仓库状态保持 node ABI。
9. **Player.tsx 接真实播放** — 接 `window.api.player`(`load`/`command`/`onState`),用 `PLAYER_STATE` 的 `time-pos` 替换模拟播放头并驱动弹幕轴;浏览器无 `window.api` 时保留现有 mock 模拟。现可真机 GUI 验证(`npm run electron:dev`)。
10. **macOS 窗口嵌入(L2 透明叠加窗)** — 目前 mpv 开自有窗口(L1);用 `addChildWindow` 把透明 Electron 窗叠到 mpv 窗上画 HTML 控制条/弹幕(docs 03 §3.4)。

## 5. 代码地图(关键路径)

```
electron/main/
├── AppServices.ts              # 组合根:Store+Secrets+EmbyService+DanmakuService(registry)
├── emby/EmbyService.ts         # 认证/浏览/搜索/PlaybackInfo→PlaybackSource/进度
├── emby/DeviceProfileBuilder.ts# 宽松 mpv profile → AC3/DTS/HEVC 直通
├── net/FetchLike.ts            # 可注入网络层(支持 rewriteHeaders/xml)
├── player/PlayerEngine.ts      # 引擎接口 + mpv/html5 能力集
├── player/MpvEngine.ts         # ✅ libmpv 引擎(JSON IPC,真机验证)
├── player/PlayerController.ts  # ✅ 编排 load/cmd/事件转发/进度回报(注入式,可单测)
├── player/mpv/MpvIpcClient.ts  # spawn mpv + unix socket + request_id 关联 + 事件
├── player/mpv/protocol.ts      # mpv JSON IPC 纯编解码(可单测)
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
└── ipc/                        # registerEmbyIpc + registerDanmakuIpc + registerPlayerIpc

electron/preload/index.ts       # 白名单 typed bridge: window.api.{emby,danmaku,player}
electron/build.mjs              # esbuild 打包 main(ESM)+preload(CJS)→ dist-electron/

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

- **环境限制**:纯逻辑/网络用 `tsc --noEmit` + Vitest 单测 + 真实 HTTP 冒烟即可验证。**mpv 控制平面已可在真机用 `MPV_SMOKE=1` 冒烟验证**(headless lavfi,不需 GUI)。仍需 GUI/真机的:Electron 窗口嵌入(L2/L3)、完整播放联调、真实 Emby 串流。
- **better-sqlite3** 是原生模块:`package.json` 已列为依赖。多数 Vitest 单测用内存 fake repo 不依赖 sqlite native;但 `tests/providerConfig.test.ts` 用真实 `openDatabase(':memory:')`,需原生已编译(当前环境已可用)。真实机器 `npm install` 会编译。
- **安全**:Emby token 经 safeStorage 加密存 Keychain,SQLite 不存明文;密码仅登录时内存使用。dandanplay appSecret/B站 cookie **绝不入客户端**(proxy 代签 / 用户登录窗)。Renderer 无外网能力,全部外部请求在 Main。
- ⚠️ **凭据轮换**:上游会话中用户曾在对话里明文贴过其真实 Emby 账号密码用于冒烟验证(未写入任何文件/提交)。**应提醒用户轮换该 Emby 密码**。
- **provider id 类型**:`shared/types/danmaku.ts` 的 `DanmakuProvider` 是 union(`'dandanplay'|'bilibili'|'tencent'`),与 `providers/DanmakuProvider.ts` 的 interface `DanmakuSourceProvider` 不要混淆。
- **mock 回退**:渲染层所有数据走 `DataSource`/queries,浏览器无 `window.api` 时自动 mock,保证预览常绿。新接的弹幕 UI 也要遵循这个回退模式。
- **提交规范**:conventional commits;全局禁用 attribution(不加 Co-Authored-By);`dist/`、`node_modules/`、`.claude/` 已 gitignore。

## 7. 一句话状态

UI + Emby(真机)+ 三源弹幕逻辑层 + 弹幕接入播放器 UI + provider_configs 持久化 + mpv 控制平面(Spike A,真机)+ **PlayerController/播放 IPC/进度回报(#6,真机控制器冒烟)** 均已完成且单测覆盖(91 通过)。Main 侧播放链路(resolve→mpv→state 推送→进度回报)端到端打通。
**Electron 构建管线已补、app 真机可启动(#8 ✅)**。下一步:① `Player.tsx` 接 `window.api.player` 真实播放(#9,现可 `electron:dev` GUI 验证);② macOS 窗口嵌入 L2 透明叠加窗(#10)。
