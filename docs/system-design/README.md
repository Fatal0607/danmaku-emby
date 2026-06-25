# DanmakuEmby —— macOS Emby 弹幕客户端系统设计

> 一款基于 Electron 的 macOS Emby 客户端:支持添加并解析 Emby 资源库、浏览/搜索/播放,
> 并以 [danmaku-anywhere](../../danmaku-anywhere-danmaku-source-scheme.md) 的 manifest 方案接入
> 多家弹幕源(弹弹play / B 站 / 腾讯),支持自动匹配与手动搜索匹配弹幕。
> **不实现发送弹幕**,只做解析与显示。

## 文档导航

| # | 文档 | 内容 |
|---|---|---|
| 00 | 本文 | 目标、范围、术语、关键决策一览 |
| 01 | [架构总览](01-architecture.md) | 进程模型、模块划分、目录结构、IPC 契约 |
| 02 | [Emby 接入层](02-emby-integration.md) | REST API、认证、多服务器、DeviceProfile、播放信息 |
| 03 | [播放引擎](03-player-engine.md) | 无声问题根因、mpv 内嵌、播放器抽象接口 |
| 04 | [弹幕子系统](04-danmaku.md) | manifest runner 移植、网络层、自动/手动匹配、渲染 |
| 05 | [数据模型与持久化](05-data-model.md) | SQLite 表结构、缓存策略、内部类型 |
| 06 | [安全与风险](06-security-and-risks.md) | 凭据存储、cookie 复用、平台风控、专利合规 |
| 07 | [实施路线图](07-roadmap.md) | 分阶段交付、技术验证 spike、测试策略 |
| 08 | [UI 设计提示](08-ui-design-prompt.md) | 视觉方向、组件布局与交互提示 |
| 09 | [应用更新方案](09-updates.md) | GitHub Release 检查更新、下载与自动更新演进 |

## 1. 产品目标

1. **多服务器管理**:添加、保存、切换多个 Emby 服务器,本地用户名密码登录。
2. **资源库解析与浏览**:解析媒体库(电影/剧集/动漫),分页、排序、筛选浏览。
3. **搜索**:全局搜索剧集/电影。
4. **播放**:稳定播放,**彻底解决浏览器无声问题**(AC3/DTS 等音轨)。
5. **弹幕显示**:接入多家弹幕源,自动匹配 + 手动搜索匹配,本地缓存,叠加渲染。
6. **观看状态同步**:进度回报、继续观看。

## 2. 非目标(Out of Scope)

- ❌ 发送/上传弹幕(仅解析与显示)。
- ❌ Windows / Linux 一期不保证(架构保持可移植,但优先 macOS)。
- ❌ Emby 服务器管理功能(转码设置、用户管理等服务端操作)。
- ❌ 下载离线缓存媒体文件(只缓存弹幕)。

## 3. 关键技术决策一览(ADR 摘要)

| 决策 | 选择 | 理由 | 详见 |
|---|---|---|---|
| 桌面框架 | **Electron + TypeScript** | 用户偏好;生态成熟;复用 web 技能栈 | 01 |
| UI 形态 | **自绘 UI(React)** 而非内嵌 Emby web | 设计可控、与原生播放器/弹幕深度集成 | 01 |
| 播放引擎 | **libmpv(原生),MVP 即采用** | 根治 AC3/DTS/HEVC 无声/不兼容,原音直通零转码;HTML5 仅作可选回退,不在 MVP 主路径 | 03 |
| 网络执行层 | **全部外部请求在 Main 进程** | 绕 CORS、可设 forbidden headers、token 不进页面 | 01/02 |
| 弹幕源方案 | **复用 dango manifest + 自实现 FetchLike** | 接口变更只更新 JSON,不重发客户端 | 04 |
| 弹幕渲染 | **mpv→ASS(libass)起步(含 MVP),透明叠加窗进阶** | 同步精确;MVP 即可用,后续兼顾 HTML 弹幕灵活度 | 03/04 |
| 自动匹配 | **dandanplay `/api/v2/match`** 优先 + 手动回退 | 为播放器设计的高命中率匹配接口 | 04 |
| 本地存储 | **SQLite(better-sqlite3)** | 弹幕缓存 / 服务器配置 / 匹配映射 | 05 |
| 凭据存储 | **macOS Keychain(safeStorage)** | 不明文存 token | 06 |

## 4. 术语

- **DeviceProfile**:客户端能力声明,Emby 据此决定 DirectPlay / DirectStream / Transcode。
- **DirectPlay**:原始文件直接播放,服务器零处理。
- **DirectStream**:仅 remux 容器或转码单条音/视频流(常用于只转音频)。
- **Manifest**:dango 声明式平台接口描述(search/episodes/danmaku/parseUrl/loginProbe)。
- **CommentEntity**:内部统一弹幕结构 `{ p, m }`。
- **FetchLike**:manifest runner 所需的网络抽象,支持 header rewrite / cookie / 多种响应类型。

## 5. 顶层数据流

```
用户添加 Emby 服务器
   → 认证拿 token(存 Keychain)
   → 浏览资源库(Emby Items API + TanStack Query 缓存)
   → 点开某集
   → PlaybackInfo(带 DeviceProfile)拿直链
   → mpv 播放(原音直通)
   → 同时:用 Emby 元数据自动匹配弹幕(dandanplay /match)
        → 命中:拉弹幕 → 缓存 SQLite → 转 ASS / 叠加渲染
        → 未命中:手动 search → episodes → danmaku
   → 播放中回报进度(/Sessions/Playing/Progress)
```
