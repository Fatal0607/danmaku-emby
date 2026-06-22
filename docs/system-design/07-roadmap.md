# 07 · 实施路线图与测试

## 7.1 技术栈确定

| 层 | 选型 |
|---|---|
| 框架 | Electron + TypeScript |
| Renderer | React + Vite |
| 服务端状态 | TanStack Query |
| 客户端状态 | Zustand |
| 本地存储 | better-sqlite3 |
| 凭据 | Electron safeStorage(Keychain) |
| 播放引擎 | libmpv(node-mpv / N-API addon);HTML5 回退 |
| 弹幕渲染 | mpv→ASS(libass) + Canvas(`danmaku`/自绘) |
| protobuf | protobufjs(内置 B 站 descriptor) |
| 打包 | electron-builder(签名 + 公证) |
| 测试 | Vitest(单元)+ Playwright(E2E) |

## 7.2 最优先:技术验证 Spike(MVP 前置闸门)

**MVP 直接采用内嵌 mpv,因此 Spike A 是 MVP 的前置必过项,务必最先完成:**

1. **Spike A — mpv on macOS(MVP 闸门)**:Electron 启动 mpv、加载一个 AC3 音轨的 MKV、确认有声音、能 seek、能通过 IPC 拿 `time-pos`。验证 L1(子窗口 + ASS 弹幕可见)。
   - 成功标准:AC3/DTS 样片有声;ASS 弹幕随播放滚动;seek 同步。
2. **Spike B — 弹幕链路最小闭环**:对单一样片,dandanplay `/match` 自动匹配 → 拉弹幕 → 转 ASS → mpv 显示。
   - 成功标准:输入一个 Emby 文件名能自动出弹幕。

> 退路定位:MVP 不依赖 HTML5。若 Spike A 受阻,优先排障打通 mpv(L1 已是最低复杂度);
> 方案 A(HTML5 + 服务端转音频)仅作为 mpv 完全不可用时的应急降级,不作为 MVP 交付形态。

## 7.3 分阶段交付(每阶段可运行)

### 阶段 1 — 骨架 + Emby 浏览 + mpv 直通播放(MVP)
- Electron + React + IPC 骨架;SQLite migration;安全基线。
- 多服务器:添加/校验/登录(Keychain)/切换。
- 资源库:Views → Items 浏览(分页/排序/筛选)、详情、搜索、图片懒加载。
- 播放:**PlayerEngine 抽象 + MpvEngine(L1 子窗口);DeviceProfileBuilder 宽松直通** → AC3/DTS/HEVC 原音直通,**MVP 即彻底解决无声**。
- 音轨/字幕轨切换;进度回报 + 续播。
- 前置:**Spike A 必须先通过**(见 7.2)。
- ✅ 里程碑:能登录、浏览、搜索,且 AC3/DTS/HEVC 原片直通有声播放。

### 阶段 2 — 弹幕打通(弹弹play,mpv→ASS)
- DanmakuService + 弹弹play provider(走 proxy/官方)。
- MatchService:`/match` 自动匹配 + 映射记忆 + 手动搜索匹配 UI。
- **弹幕渲染走 mpv→ASS(L1)**(`toAss`);弹幕设置(透明度/字号/速度/屏蔽)映射进 ASS 样式。
- danmaku_cache 缓存。
- ✅ 里程碑:自动/手动匹配并在 mpv 上同步显示弹幕。

### 阶段 3 — 多源(B 站 / 腾讯)+ manifest
- 移植 ManifestRegistry / ManifestRunner / FetchLike(header rewrite / cookie / xml / protobuf / 节流)。
- 接 B 站(WBI + XML/protobuf)、腾讯(pbaccess + segment)。
- CookieAuthService 开窗登录;loginProbe 引导。
- manifest 热更新。
- ✅ 里程碑:三源可用,接口变更可热更。

### 阶段 4 — 播放/弹幕体验进阶(mpv L2)
- mpv L2(透明叠加窗):统一 HTML 控制条 + 富样式/可交互 Canvas 弹幕(视需要再上 L3)。
- 弹幕高级设置(密度/区域/关键词屏蔽)在 Canvas 渲染下增强。
- ✅ 里程碑:统一控制条 + 灵活 HTML 弹幕。

### 阶段 5 — 打磨与发布
- 错误提示体系(未登录/地区/风控/接口变更)。
- 性能:列表虚拟滚动、弹幕密度限制、缓存修剪。
- 签名 + 公证 + 自动更新。
- ✅ 里程碑:可发布 macOS 应用。

## 7.4 测试策略(对照通用/web 测试规则)

### 单元(Vitest,≥80% 覆盖关键模块)
- `toAss`:`{p,m}` → ASS(时间/颜色 BGR/模式/转义)。
- WBI 签名、protobuf 解码、XML 解析(对 fixture 断言 canonical `{p,m}`)。
- DeviceProfileBuilder:不同能力 → 正确 profile。
- MatchService:命中/外推/手动覆盖逻辑。
- Repository:缓存命中、LRU 修剪、manual 不被 auto 覆盖。

### 集成
- FetchLike:header rewrite 生效、cookie 携带、节流/并发参数。
- 各 provider pipeline 对 fixture 的端到端映射。
- EmbyService:认证、Items 分页、PlaybackInfo URL 解析(对 mock 服务器)。

### 平台 smoke(定期/CI 可选)
- 真实 dandanplay / B 站 / 腾讯 接口冒烟,捕获接口漂移 → 触发 manifest 更新。

### E2E(Playwright)
- 添加服务器 → 浏览 → 播放 → 弹幕出现 的关键流。
- 弹幕设置变更实时生效。
- 避免基于超时的脆弱断言,用确定性等待。

### 测试资产
- 每平台保留 search/episodes/danmaku fixture(JSON/XML/protobuf 样本)。
- AC3/DTS/HEVC 小样片用于播放引擎手测/CI 媒体测试。

## 7.5 验收标准(对齐产品目标)

- [ ] 可添加多个 Emby 服务器并切换,token 安全存储。
- [ ] 浏览/搜索/详情流畅,图片无明显 CLS。
- [ ] **AC3/DTS/HEVC 内容播放有声**(mpv 直通或服务端转音频)。
- [ ] 弹幕自动匹配命中常见番剧;手动匹配可覆盖。
- [ ] 三家弹幕源可用;接口变更可经 manifest 热更恢复。
- [ ] 弹幕渲染与播放进度同步,设置实时生效。
- [ ] 续播与进度同步到 Emby。
- [ ] 应用通过签名与公证,可在 macOS 正常分发运行。
