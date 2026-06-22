# 04 · 弹幕子系统

> 完整复用 [danmaku-anywhere 弹幕源方案](../../danmaku-anywhere-danmaku-source-scheme.md):
> 声明式 manifest + 统一 runner,在 Electron 把扩展网络能力替换为 session 能力。

## 4.1 子系统结构

```
DanmakuService(业务编排)
 ├─ MatchService        自动匹配(dandanplay /match) + 映射记忆
 ├─ ManifestRegistry    catalog 拉取/下载/校验/构建 runner/热更新
 ├─ ManifestRunner      执行 search / episodes / danmaku pipeline
 ├─ FetchLike           网络层(header rewrite / cookie / xml·protobuf / 节流)
 ├─ CookieAuthService   B站/腾讯 开窗登录,复用 session cookie
 ├─ Store(repo)        弹幕缓存 / provider 配置 / 匹配映射
 └─ toAss               {p,m} → ASS(mpv L1 渲染用)
```

## 4.2 统一内部类型

```ts
// shared/types/danmaku.ts
export interface CommentEntity { p: string; m: string }  // p="time,mode,color,userHash"

export interface DanmakuTrack {
  provider: string          // 'dandanplay' | 'bilibili' | 'tencent'
  providerConfigId: string
  indexedId: string         // 平台内集标识(如 dandanplay episodeId)
  seasonId: string
  comments: CommentEntity[]
  commentCount: number
  lastChecked: number
}

export interface Season {
  provider: string
  providerIds: Record<string, unknown>   // 保留平台关键 ID(seasonId/mediaId/cid…)
  indexedId: string
  title: string
  type?: string
  imageUrl?: string
  episodeCount?: number
  year?: number
}

export interface Episode {
  provider: string
  providerIds: Record<string, unknown>   // cid/aid/bvid/epid 或 vid/cid 或 episodeId…
  indexedId: string
  title: string
  episodeNumber?: number
}

export interface ProviderConfig {
  id: string
  manifestId: string        // 'dandanplay' | 'bilibili' | 'tencent'
  name: string
  enabled: boolean
  configValues: Record<string, unknown>  // 如 ddp baseUrl、B站 danmakuFormat
}
```

## 4.3 Manifest 生命周期(Electron 版)

照搬方案文档第 4 节,改动仅在来源与存储:

1. 启动/刷新时 `ManifestRegistry` 拉 catalog(可走自家 proxy 或直连 `dango` raw)。
2. 下载缺失/过期 manifest → schema 校验 → `new ManifestRunner(manifest, { fetcher: FetchLike })`。
3. manifest 与 catalog 存 SQLite(`manifests` 表),离线可用;内置一份兜底在 `manifests/`。
4. 首次安装 `seedDefaultProviders()` 写入默认 provider 配置:

| provider | manifestId | 默认 configValues |
|---|---|---|
| 弹弹play | `dandanplay` | `baseUrl = {PROXY}/ddp`(或官方),`chConvert = 0` |
| B 站 | `bilibili` | `danmakuFormat = xml` |
| 腾讯视频 | `tencent` | 无 |

5. 版本比对提示可更新(热更新:接口变只更新 JSON,不重发客户端)。

## 4.4 网络层 FetchLike(等价 extensionFetchLike)

Main 进程实现,满足 runner 需求:

```ts
interface FetchLikeRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | Uint8Array
  rewriteHeaders?: Record<string, string>  // 需改写的 forbidden headers
  credentials?: 'include' | 'omit'
  responseType: 'json' | 'text' | 'xml' | 'arraybuffer'
}
```

能力对照(方案文档 6.2 / 12.2):

| 扩展能力 | Electron 替代 |
|---|---|
| `chrome.declarativeNetRequest` 改头 | `session.webRequest.onBeforeSendHeaders` 临时注入 `rewriteHeaders` |
| `chrome.webRequest` 抓 Set-Cookie | `session.cookies` + onHeadersReceived(必要时自建 jar 回放) |
| `credentials: include` | `net.fetch` 走 session,自动带 cookie |
| service worker fetch | `electron.net.fetch`(走系统网络栈,代理/cookie 友好) |

**响应解码** `net/decoders/`:
- XML(B 站 `list.so`):解析 `<d p="...">text</d>` → `{p,m}`。
- protobuf(B 站 `seg.so`):内置 `dm.v1.DmSegMobileReply` descriptor 解码分段。
- JSON(弹弹play/腾讯)。

**节流与并发(务必保留,防风控,方案文档 13.4)**:
- B 站 protobuf 分段:顺序 `concurrency=1`,`throttleMs=200`,接受 HTTP 304,连续空段达阈值停止。
- 腾讯 segment:`concurrency=4`,`throttleMs=100`。

## 4.5 三平台接入要点(照搬方案文档 7/8/9)

### 弹弹play(主力,最简单)
- 优先走自家 proxy(`{PROXY}/ddp/api/v2/...`)或官方 `https://api.dandanplay.net`。
- 官方签名 `appSecret` **不放客户端**,走 proxy 代签(见 06)。
- 搜索 `/search/anime` → 剧集 `/bangumi/{bangumiId}` → 弹幕 `/comment/{episodeId}?withRelated=true&chConvert=`。

### B 站
- `Referer: https://www.bilibili.com/`,`credentials: include`。
- 搜索需 **WBI 签名**:`nav` 取 imgKey/subKey → `mixinKey` → `w_rid=md5(sortedQuery+mixinKey)`;并行搜 `media_bangumi` + `media_ft`。
- 季 `pgc/view/web/season?season_id=` → 取 `cid`(弹幕关键 ID)。
- 弹幕:XML `x/v1/dm/list.so?oid={cid}` 或 protobuf 分段 `x/v2/dm/web/seg.so`。
- `loginProbe`:`nav` → `isLogin`;未登录引导用户 `CookieAuthService` 开 B 站登录窗。

### 腾讯视频
- `Origin: https://v.qq.com` + `Referer: https://v.qq.com/`。
- 搜索 `MultiTerminalSearch/MbSearch`(POST,固定参数体)→ 剧集 `PageServer/GetPageData`(分页,过滤预告)→ 取 `vid`。
- 弹幕:`barrage/base/{vid}` 拿分段索引 → 并发 `barrage/segment/{vid}/{segment_name}`。
- 颜色:`gradient_colors[0]` → `color` → 默认白 `16777215`。

## 4.6 匹配编排(体验核心)

### 自动匹配:dandanplay `/api/v2/match`
利用 Emby 给的干净元数据:

```ts
interface DanmakuMatchInput {
  embyItemId: string
  fileName: string          // Emby MediaSource 文件名
  fileSize?: number
  videoDurationSec?: number
  seriesTitle?: string      // 剧名
  season?: number
  episode?: number          // 集号
}
```

链路:
1. 查 **映射记忆**(`danmaku_map`:`embyItemId → {provider, episodeId}`)→ 命中直接用。
2. 否则 `POST /api/v2/match` 传文件名(+大小/时长)→ 高命中返回 `episodeId`。
3. 命中 → 走 danmaku 拉取 → 写映射记忆 + 缓存。
4. 未命中 → 返回 `null`,UI 提示并入口手动匹配。

### 按集号外推
同一剧集已匹配某集后,后续集按 `episodeNumber` 偏移推算 `episodeId`(弹弹play 同番剧 episodeId 连续),减少逐集匹配。命中后仍校验标题。

### 手动匹配 UI 流程
`search(keyword)` → 选 Season → `episodes(seasonIds)` → 选 Episode → `fetch` → 写映射记忆(用户选择优先级最高,覆盖自动结果)。

## 4.7 拉取与缓存(方案文档第 10 节)

`DanmakuService.getDanmaku()`:
1. 解析 episode meta。
2. 查本地缓存(provider + seasonId + indexedId),命中且非 `forceUpdate` → 直接返回。
3. 否则经 runner 拉取 → 写 SQLite(`comments` JSON、`commentCount`、`lastChecked`)。

好处:避免重复打接口;删 provider 配置后旧弹幕仍可看;源更新失败有兜底。

## 4.8 {p,m} → ASS 转换(mpv L1 渲染)

`render/toAss.ts` 把弹幕生成 ASS 字幕,交 mpv libass 渲染:
- `p` 拆出 `time`(秒)、`mode`、`color`、`userHash`。
- 滚动弹幕(mode=1):`\move(x1,y,x2,y)` 从右到左,时长由速度配置定;按行做防重叠分配(轨道算法)。
- 顶部/底部弹幕:固定居中,`\an8`/`\an2`。
- 颜色:十进制 → ASS `&HBBGGRR&`(注意 BGR 序)。
- 全局样式:字号、透明度(`\alpha`)、描边,来自用户配置。
- 输出整段 ASS 文本 → `PlayerEngine.loadAssOverlay(assText)`。

> Canvas 渲染(html5 / mpv L2·L3)走另一条:`comments` 直接喂渲染引擎,按 `time-pos` 推进。

## 4.9 弹幕错误码

| 场景 | code | UI |
|---|---|---|
| B站/腾讯未登录 | `DM_NOT_LOGGED_IN` | 引导开平台登录窗设置 Cookie |
| 地区/会员限制 | `DM_REGION_BLOCKED` | 该内容弹幕受地区/会员限制 |
| 被风控 | `DM_RATE_LIMITED` | 请求过频,稍后重试(已自动节流) |
| 自动匹配失败 | `DM_NO_MATCH` | 未找到匹配,试试手动搜索 |
| 接口结构变更 | `DM_PARSE_FAILED` | 弹幕源接口可能已变更,等待更新 |
