# DanmakuEmby — 开发交接文档 (Handoff)

> 给下一个 agent 会话的自包含上下文。先读 `docs/system-design/`(设计方案 01–08) +
> 本文件,再读 `README.md`。所有改动遵循 `~/.claude/rules`(中文注释非强制,代码注释沿用英文以匹配现有风格)。

## 1. 项目是什么

自建 **Emby 客户端 + B站式弹幕叠加**,影院深色 + 玻璃拟态的 macOS 桌面应用。
技术栈(已按设计文档 07 落地):**Electron + Vite + React + TypeScript + TanStack Query + Zustand +
better-sqlite3 + safeStorage(Keychain)**;播放引擎默认 **GPU mpv window**(mpv 自己渲染/硬解,不走 RGBA 帧 IPC),L3 libmpv 软件帧真内嵌保留为实验路径。

## 2. 运行 / 验证

```bash
npm install          # 会编译 better-sqlite3 原生模块(需 macOS 工具链)
npm run dev          # Vite 浏览器预览(走 mock 数据,无需 Electron)
npm run electron:dev # 默认 GPU mpv window:build + rebuild:electron + 启动窗口
npm run electron:dev:l3 # 实验 L3 libmpv render API 软件帧真内嵌
npm run electron:dev:mpv-window # GPU mpv window 显式别名
npm run build        # tsc --noEmit + vite build(渲染层)
npm run build:electron # esbuild 打包 main+preload → dist-electron/
npm test             # Vitest 单元测试(当前 91 通过 / 12 跳过;需 node ABI,见下)
# ⚠️ 跑 GUI 后 better-sqlite3 是 Electron ABI,要全量测先 `npm run rebuild:node`
```

L3 软件帧实验路径默认目标 60fps,但为了避免 RGBA 帧 IPC 吞吐过高,默认只渲 720p 像素预算。
可用 `DMEMBY_L3_TARGET_FPS=30 npm run electron:dev:l3` 降帧,或
`DMEMBY_L3_MAX_PIXELS=2073600 npm run electron:dev:l3` 做 1080p 软件帧诊断。
`DMEMBY_L3_RENDER_BACKEND=opengl` 已作为 probe/fallback 开关预留;当前 native report 标记 OpenGL 未 wired,会回落到 software。
OpenGL 离屏 FBO probe 已可用:
`MPV_RENDER_OPENGL_SMOKE=1 npx vitest run tests/smoke/mpvRenderOpenGL.smoke.test.ts`。

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
# libmpv render API 真内嵌帧流(需 node ABI,opt-in):
MPV_RENDER_SMOKE=1 npx vitest run tests/smoke/mpvRender.smoke.test.ts
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
| **Player.tsx 接真实播放(#9)** — Renderer 新增 PlayerSource(Electron `window.api.player` / 浏览器 mock),播放器加载真实 Emby item 后调用 `player.load`,按钮/进度条发 `player.command`,订阅 `PLAYER_STATE` 用 mpv `time-pos` 驱动 UI 播放头和 HTML 弹幕轴 | ✅ `tsc` + `build` + 单测 + `build:electron` 通过;真机播放验证通过。顺带修复恢复播放时 mpv `loadfile` start 参数顺序(`index` 必须在 options 前)、弹幕 provider 失败不再中断播放、L1 mpv 窗口默认限幅居中 | 本次 |
| **播放窗口可见性兜底(#10 前置修复)** — mpv 窗口按 Electron bounds 限幅居中并 `--ontop`,避免透明 Electron 叠加窗在当前 macOS/Electron 组合下渲成黑底时盖住视频;播放器 route 仍保留真实 `PLAYER_STATE` 驱动 UI | ✅ 真机验证通过:OkEmby item `42846` 进入播放器后 mpv spawn、`pause=false`、`time-pos` 推进,mpv 窗口视频 + ASS 弹幕可见。修复 Electron 32 无 `screen.dipToScreenRect` 时 mpv 启动参数构造抛错,并修复 Player effect 因 item 查询到达而重复 `player.load` 的竞态 | 本次 |
| **GPU mpv window 默认播放路径** — 普通 `electron:dev` 默认走 `MpvEngine`,由系统 mpv 使用 `--hwdec=videotoolbox` 自行渲染视频,避免 L3 软件 RGBA 帧通过 Main→Renderer IPC 多次拷贝造成低帧率。`LibmpvRenderEngine` 仍保留为 `electron:dev:l3` 实验路径 | ✅ 已切默认 engine resolver,保留 `mpv`/`mpv-window` 兼容别名和 `l3`/`libmpv-render` opt-in | 本次 |
| **L3 libmpv render API 真内嵌原型** — 新增本地 native addon `@danmaku-emby/mpv-render`,用 `vo=libmpv` + `MPV_RENDER_API_TYPE_SW` 渲染 RGBA 帧,macOS 解码尽量走 `videotoolbox-copy`,Main 通过 `PLAYER_FRAME` 推给 Renderer canvas;Renderer 用窗口尺寸/DPR 动态调整 render surface,`LibmpvRenderEngine` 保持 `PLAYER_STATE` time-pos 驱动弹幕轴。L3 不再把 ASS 弹幕烘进视频帧,弹幕只走 HTML 层;播放器页卸载时发送 `PLAYER_CMD stop`,停止音频并上报 Emby stop | ✅ Node native smoke 已验证 lavfi 可出 RGBA 帧且时间推进;现默认 60fps 目标 + 720p 软件帧预算,支持 `DMEMBY_L3_TARGET_FPS`/`DMEMBY_L3_MAX_PIXELS` 调参。native addon 已暴露 `getRenderBackendReport()` 和 `DMEMBY_L3_RENDER_BACKEND` probe/fallback resolver,并新增 macOS CGL + libmpv OpenGL 离屏 FBO smoke(`renderOpenGLProbeFrame`)。限制:OpenGL 已能离屏渲染并读回像素,但尚未接入 Electron/Chromium shared texture;Metal 需后续桥接。现已降为 opt-in 实验路径(`electron:dev:l3`) | 本次 |
| **首页 Emby 视图完整展示 + 查看更多列表页** — 首页从 `emby.views` 动态渲染所有 Emby 资源库/分类/播放列表行,每行用 `buildHomeSectionQuery` 拉最近内容;可打开的行在标题同行最右侧显示「查看更多」并进入 `/view/:viewId`,列表页用 `buildViewSectionQuery` 分页拉完整数据。横向 rail 改成与顶部返回按钮同风格的左右箭头,去掉遮罩和原生横向滚动条;进入列表页时重置真实滚动容器 `.app-content` 到顶部 | ✅ `homeSections`/`homeRender`/`scrollRail`/`pageScroll` 单测覆盖;浏览器 mock 与 Electron 数据源均保留。`继续观看`/`最近添加` 无完整列表入口时不再显示不可点击的「查看更多」 | 本次 |

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
   - 备注:默认播放路径已切回 GPU mpv window,避免 L3 软件帧 IPC 导致低帧率;L3 仅作为 `npm run electron:dev:l3` 实验路径。
4. **dandanplay 真实凭据/proxy** — 申请 AppId 或部署签名 proxy,填 `preferences.dandanplayConfig`。
5. ✅ **provider_configs 持久化**(已完成,本次)— `ProviderConfigRepo`(seed 内置默认、`setEnabled`/`setSortOrder`、`seedDefaults` 幂等且保留用户覆盖,真实 :memory: DB 单测)。`AppServices` 从 `provider_configs` 读出 enabled/order 构建 registry;`ProviderRegistry` 加 `setEnabled`/`setSortOrder` 运行时变更。新增 IPC `DM_LIST_CONFIGS`/`DM_SET_ENABLED`/`DM_REORDER` + preload 桥;`src/lib/danmakuSource.ts` 加 `listConfigs`/`setProviderEnabled`/`reorderProviders`(mock 用模块级可变状态),`queries.ts` 加 `useDanmakuConfigs`/`useSetProviderEnabled`/`useReorderProviders`;设置页「弹幕来源」改为真实开关+上下移排序。预览验证:关掉某源后匹配弹窗的跨源搜索即排除它。
   - 顺带修复冷启动 bug:migration v1 用 `CREATE TABLE app_meta`(无 IF NOT EXISTS),而 `db.ts` 已 bootstrap 同名表 → 新库 `openDatabase` 必抛错(应用无法冷启动)。改为 `CREATE TABLE IF NOT EXISTS`,由本次 repo 单测暴露。
   - 备注:`configValues` 已可持久化但暂未承载内容(dandanplay 凭据仍在 `preferences.dandanplayConfig`);未来按 provider 存配置可复用该字段。
6. ✅ **进度回报接 mpv**(已完成,本次)— `PlayerController` 在 `electron/main/player/PlayerController.ts`,由 `time-pos` 事件节流(默认 10s)驱动 `EmbyService.reportProgress` 的 start/progress/stop;暂停/结束/dispose 各自上报;stop 幂等(同步清 current 防竞态重复)。注入式依赖(PlaybackResolver/DanmakuOverlaySource/StateSender)便于单测。
7. **manifest 热更新**(docs 04 §4.3)、**E2E(Playwright)**、CookieAuthService(B站登录窗,docs 06 §6.3)。
8. ✅ **Electron 构建管线**(已完成,本次,真机启动验证)— `electron/build.mjs` 用 esbuild 把 `electron/main`→ESM(`dist-electron/main/index.js`)、`electron/preload`→CJS(`.cjs`)打包,externalize `electron`+`better-sqlite3`,alias `@shared`。脚本:`build:electron`、`rebuild:electron`(electron-rebuild)、`rebuild:node`(npm rebuild),`electron:dev = vite build && build:electron && rebuild:electron && electron .`。`app` 干净启动(DB/IPC/窗口均 OK)。
   - ⚠️ **native ABI 双轨**:`better-sqlite3` 是原生模块,Electron(ABI 128)与系统 Node(ABI 141,跑 Vitest)不兼容。约定:跑 GUI 用 `electron:dev`(自动 rebuild:electron);跑全量测试用 `npm run rebuild:node && npm test`。`tests/providerConfig.test.ts` 已加 `runIf(sqliteOk)` 守卫——ABI 不匹配时自动跳过(不崩),其余测试不受影响。默认仓库状态保持 node ABI。
9. ✅ **Player.tsx 接真实播放**(已完成,本次)— `src/lib/playerSource.ts` 新增 Renderer 播放源抽象:Electron 走 `window.api.player.load/command/onState`,浏览器无 `window.api` 走 mock no-op;`Player.tsx` 改为用 `useMediaItem` 拉真实 Emby item,Electron 下 `PLAYER_STATE.timeSec`(mpv `time-pos`)是 UI 播放头/进度条/HTML 弹幕轴的唯一时间源,播放/暂停/seek 发 `PLAYER_CMD`;浏览器预览继续用本地 `setInterval` mock。`MediaItem` 补 `durationSec/playbackPositionTicks`,起播传 `startTicks` 并用真实 duration 渲染进度。真机播放修复:① `MpvEngine.loadfile` 恢复播放的 options 改为 `loadfile url replace -1 {start}`(mpv 要先传 playlist index);② `PlayerController` 弹幕 autoMatch/ASS overlay 失败时返回 0 条,不再让视频 load 失败;③ mpv L1 独立窗口加 `--autofit-larger=1280x720 --geometry=50%:50%`,避免 4K 窗口偏到屏幕外。验证:`npm run typecheck`、`npm run build`、`npm test`、真机播放(OkEmby episode 42846:mpv `idle-active=false`, `pause=false`, `time-pos` 推进)通过。
10. ✅ **GPU mpv window 默认播放 + L3 libmpv render API 软件帧原型保留** — 默认 `npm run electron:dev` 现在走 `MpvEngine`/系统 mpv 硬解渲染,避免 L3 软件 RGBA 帧跨 IPC 导致低帧率。`native/mpv-render` 直接持有 libmpv 的 L3 原型仍可通过 `npm run electron:dev:l3` 手动启用;该路径定时 render RGBA 帧并通过 `CH.PLAYER_FRAME` 推给 `Player.tsx` 的 canvas。`Player.tsx` 用 `ResizeObserver` 把播放舞台尺寸发给 Main,避免固定 640×360 拉伸;L3 的 `loadAssOverlay` 为 no-op,避免 ASS 弹幕被烘进低分辨率视频帧导致重复且发糊;播放器页 unmount 会发送 `stop`,避免返回首页后音频继续播放。
   - ⚠️ **当前验证结论**:Electron 播放页即使 `transparent: true` + `frame: false`,在本机仍会以黑底覆盖 mpv;禁用 Electron 硬件加速也未解决。因此暂不启用 HTML 透明叠加置顶,避免回归成“能播放但看不到画面”。
   - ⚠️ **`mpv --wid` 实验结论(本次补充)**:已实现 opt-in 嵌入路径,`DMEMBY_MPV_EMBED=1` 时 Main 会优先取 macOS `getMediaSourceId()` 的 `CGWindowID`,回退到 `getNativeWindowHandle()` 的指针,并让 mpv 以 `--wid=<id>` 启动;也试过 `--vo=libmpv`、`--vo=gpu`、CSS/html/body/root/contentView 全透明。验证结果:mpv 进程确实带 `--wid`,`idle-active=false`、`pause=false`、`time-pos` 推进、`vo-configured=true`,但视频层在 Electron/Chromium 合成下不可见(黑底,只剩 HTML 控制层/弹幕)。因此默认不启用 `--wid`,继续走已验证可播放的 `--ontop` 独立窗口兜底。
   - ⬜ **下一步**:把 L3 从软件帧拷贝升级到 OpenGL/Metal shared texture,并补真实 Emby GUI 回归截图/性能指标。另补:路由离开时 stop/unload mpv、全屏/Spaces 行为、按实际窗口尺寸动态调整 render surface。
11. ✅ **首页/资源库列表信息架构修复** — `src/features/home/Home.tsx` 不再只展示固定 mock 类目,而是用真实 `emby.views` 生成资源库 rows;`src/features/view/ViewAll.tsx` 新增完整列表页,从当前 view 的第一页开始展示并复用 PosterCard。`src/lib/pageScroll.ts` 专门处理 shell 内部滚动容器,修复从首页点「查看更多」时继承第二行左右滚动位置的问题;`src/lib/scrollRail.ts` 封装按页滚动距离,UI 箭头与 `page-back-button` 风格统一。
   - ⚠️ **下一步**:如果用户 Emby 里有 `Playlist`/`BoxSet`/合集类 view,当前 `EmbyItemType` 仍偏视频条目(`Movie|Series|Season|Episode|Video`)。后续应扩展 shared type 与 mapper,必要时对播放列表/合集走“取容器子项”的专用查询,避免完整列表只显示可播放视频而漏掉容器本身。

## 5. 代码地图(关键路径)

```
electron/main/
├── AppServices.ts              # 组合根:Store+Secrets+EmbyService+DanmakuService(registry)
├── emby/EmbyService.ts         # 认证/浏览/搜索/PlaybackInfo→PlaybackSource/进度
├── emby/DeviceProfileBuilder.ts# 宽松 mpv profile → AC3/DTS/HEVC 直通
├── net/FetchLike.ts            # 可注入网络层(支持 rewriteHeaders/xml)
├── player/PlayerEngine.ts      # 引擎接口 + mpv/html5 能力集
├── player/MpvEngine.ts         # ✅ libmpv 引擎(JSON IPC,L1 外部窗口回退)
├── player/LibmpvRenderEngine.ts# ✅ L3:libmpv render API → RGBA frame → Electron canvas
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
├── lib/playerSource.ts         # PlayerSource 抽象(player IPC / 浏览器 mock)
├── lib/danmaku.ts              # {p,m}→视图弹幕、provider 标签、十进制色→hex
├── lib/queries.ts              # TanStack Query hooks(Emby + danmaku 均已接)
├── lib/mappers.ts              # EmbyItem→MediaItem, EmbyServer→Server
├── lib/homeSections.ts         # Emby view → 首页/完整列表查询参数
├── lib/pageScroll.ts           # shell 内部 `.app-content` 滚动复位
├── lib/scrollRail.ts           # 横向资源行左右按页滚动
├── lib/mockData.ts             # 浏览器预览 mock(含 {p,m} mockDanmakuComments)
└── features/                   # 按界面分目录(player/ 含弹幕层+设置+手动匹配,view/ 完整资源库列表)

shared/types/                   # ipc(channels+信封)/emby/danmaku/player/domain — Main 与 Renderer 共享
native/mpv-render/              # N-API addon:libmpv software render API prototype
```

## 6. 重要约束 / 注意事项

- **环境限制**:纯逻辑/网络用 `tsc --noEmit` + Vitest 单测 + 真实 HTTP 冒烟即可验证。**mpv 控制平面已可在真机用 `MPV_SMOKE=1` 冒烟验证**(headless lavfi,不需 GUI);默认播放现在走 GPU mpv window。**L3 native render 可用 `MPV_RENDER_SMOKE=1` 冒烟验证**但仅作实验;真内嵌要继续做 OpenGL/Metal shared texture、窗口尺寸动态 surface、全屏/Spaces、路由离开时 stop/unload mpv。
- **better-sqlite3** 是原生模块:`package.json` 已列为依赖。多数 Vitest 单测用内存 fake repo 不依赖 sqlite native;但 `tests/providerConfig.test.ts` 用真实 `openDatabase(':memory:')`,需原生已编译(当前环境已可用)。真实机器 `npm install` 会编译。
- **安全**:Emby token 经 safeStorage 加密存 Keychain,SQLite 不存明文;密码仅登录时内存使用。dandanplay appSecret/B站 cookie **绝不入客户端**(proxy 代签 / 用户登录窗)。Renderer 无外网能力,全部外部请求在 Main。
- ⚠️ **凭据轮换**:上游会话中用户曾在对话里明文贴过其真实 Emby 账号密码用于冒烟验证(未写入任何文件/提交)。**应提醒用户轮换该 Emby 密码**。
- **provider id 类型**:`shared/types/danmaku.ts` 的 `DanmakuProvider` 是 union(`'dandanplay'|'bilibili'|'tencent'`),与 `providers/DanmakuProvider.ts` 的 interface `DanmakuSourceProvider` 不要混淆。
- **mock 回退**:渲染层所有数据走 `DataSource`/queries,浏览器无 `window.api` 时自动 mock,保证预览常绿。新接的弹幕 UI 也要遵循这个回退模式。
- **提交规范**:conventional commits;全局禁用 attribution(不加 Co-Authored-By);`dist/`、`node_modules/`、`.claude/` 已 gitignore。

## 7. 一句话状态

UI + Emby(真机)+ 三源弹幕逻辑层 + 弹幕接入播放器 UI + provider_configs 持久化 + mpv 控制平面(Spike A,真机)+ **PlayerController/播放 IPC/进度回报(#6,真机控制器冒烟)** 均已完成且单测覆盖。Main 侧播放链路(resolve→player engine→state 推送→进度回报)端到端打通。
**Electron 构建管线已补(#8 ✅),Renderer 已接 `window.api.player` 真实播放(#9 ✅),默认播放已切到 GPU mpv window 避免软件帧 IPC 低帧率,L3 libmpv render API 软件帧真内嵌保留为 opt-in 实验(#10 ✅),首页已接完整 Emby views 并补 `/view/:viewId` 查看更多列表页(#11 ✅)**。`mpv --wid` 已做 opt-in 实验但在当前 Electron/macOS 组合下黑屏不可用;下一步:L3 OpenGL/Metal shared texture、真实 Emby GUI 回归截图/性能指标,以及扩展 Playlist/BoxSet/合集类容器映射。
