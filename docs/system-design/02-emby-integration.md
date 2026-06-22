# 02 · Emby 接入层

## 2.1 设计原则

- 写成 **接口 + 实现**,Emby 与 Jellyfin API 95% 同源,先做 Emby,几乎免费兼容 Jellyfin。
- 所有请求经 Main 进程 `FetchLike`,统一注入认证头与 `X-Emby-*` 标识。
- 列表数据交给 Renderer 的 TanStack Query 缓存;Main 不做业务级缓存(弹幕除外)。

## 2.2 认证与设备标识

Emby 请求需带授权头:

```
X-Emby-Authorization: MediaBrowser Client="DanmakuEmby", Device="MacBook",
                      DeviceId="<稳定UUID>", Version="<appVersion>"
X-Emby-Token: <AccessToken>          # 登录后
```

- `DeviceId`:首次启动生成稳定 UUID,存 SQLite(`app_meta`),用于 Emby 会话识别。
- 登录:`POST {baseUrl}/Users/AuthenticateByName` body `{ Username, Pw }`(Emby 也接受 `Pw` 明文走 HTTPS;或 `password` SHA1,按服务器版本)。响应含 `AccessToken`、`User.Id`、`ServerId`。
- **token 存 Keychain(safeStorage)**,SQLite 只存非敏感的服务器元信息(见 05、06)。

### 服务器输入与发现

```ts
interface ServerInput {
  address: string   // 用户输入,可能是 http(s)://host:port 或裸 host
  username: string
  password: string
}
```

地址规整:补全协议(默认 https,失败回退 http)、探测 `GET /System/Info/Public` 确认是 Emby 并拿 `ServerName`/`Version`/`Id`。多服务器以 `Id` 去重。

## 2.3 核心端点清单

| 功能 | 方法 + 路径 | 说明 |
|---|---|---|
| 公共信息 | `GET /System/Info/Public` | 探测/校验服务器 |
| 登录 | `POST /Users/AuthenticateByName` | 拿 token |
| 媒体库 | `GET /Users/{uid}/Views` | 顶层库列表 |
| 浏览条目 | `GET /Users/{uid}/Items` | 见下方参数 |
| 条目详情 | `GET /Users/{uid}/Items/{id}` | 单条详情 |
| 季/集 | `GET /Shows/{seriesId}/Seasons`、`/Shows/{seriesId}/Episodes` | 剧集结构 |
| 搜索 | `GET /Users/{uid}/Items?SearchTerm=...&Recursive=true` | 全局搜索 |
| 图片 | `GET /Items/{id}/Images/{type}` | Primary/Backdrop/Thumb |
| 播放信息 | `POST /Items/{id}/PlaybackInfo` | **核心**,见 2.4 |
| 流地址 | 见 PlaybackInfo 返回 | DirectStream/Transcoding URL |
| 字幕 | `GET /Videos/{id}/{mediaSourceId}/Subtitles/...` | 外挂字幕 |
| 标记会话 | `POST /Sessions/Playing` 等 | 进度回报,见 2.5 |

### `GET /Users/{uid}/Items` 常用参数

```
ParentId        当前库/文件夹 id
IncludeItemTypes Movie,Series,Episode
Recursive       true(库内递归)
SortBy          SortName,DateCreated,CommunityRating,...
SortOrder       Ascending|Descending
StartIndex      分页偏移
Limit           分页大小
Fields          Overview,Genres,MediaSources,UserData,...
Filters         IsUnplayed,IsFavorite
SearchTerm      搜索
```

返回 `{ Items: Item[], TotalRecordCount }` → 映射为内部 `Page<Item>`。

## 2.4 PlaybackInfo 与 DeviceProfile(无声问题的总开关)

播放前必走:

```
POST /Items/{itemId}/PlaybackInfo?UserId={uid}
Body: {
  DeviceProfile: <见下>,
  MaxStreamingBitrate, StartTimeTicks, MediaSourceId?, AudioStreamIndex?, SubtitleStreamIndex?
}
```

返回 `MediaSources[]`,每个含:`Id`、`SupportsDirectPlay`、`SupportsDirectStream`、`TranscodingUrl`、`DirectStreamUrl`、`MediaStreams`(音视频/字幕轨)。客户端据此决定最终 URL。

### DeviceProfile 随播放引擎而变

**这是解决无声的关键:profile 决定 Emby 是否转码,以及转成什么。**

- **mpv 引擎(MVP 默认)**:声明"几乎全支持",让 Emby 返回**原始文件直链(DirectPlay)**,mpv 本地解 AC3/DTS/TrueHD/HEVC,零转码、原音质。

```jsonc
// DeviceProfileBuilder for mpv —— 宽松直通
{
  "MaxStaticBitrate": 1000000000,
  "MaxStreamingBitrate": 1000000000,
  "DirectPlayProfiles": [
    { "Container": "mkv,mp4,avi,ts,m2ts,flv,webm,mov,wmv",
      "Type": "Video",
      "VideoCodec": "h264,hevc,vp9,av1,mpeg4,mpeg2video,vc1",
      "AudioCodec": "aac,ac3,eac3,dts,truehd,flac,mp3,opus,vorbis,pcm" }
  ],
  "TranscodingProfiles": [/* 兜底:实在不能直通时转 hls+h264+aac */],
  "SubtitleProfiles": [
    { "Format": "ass", "Method": "External" },
    { "Format": "srt", "Method": "External" },
    { "Format": "pgssub", "Method": "Embed" }
  ]
}
```

- **HTML5 引擎(可选降级,非 MVP)**:声明音频只支持 `aac,mp3,opus`、视频 `h264`,Emby 对 AC3/DTS 源做 **DirectStream(仅转音频为 AAC,视频 remux 不重编码)**——浏览器播放器也有声音,代价是服务器轻量音频转码。仅在 mpv 不可用时降级使用。

```jsonc
// DeviceProfileBuilder for html5 —— 强制兼容
"DirectPlayProfiles": [
  { "Container": "mp4,webm", "Type": "Video",
    "VideoCodec": "h264,vp9", "AudioCodec": "aac,mp3,opus" }
],
"TranscodingProfiles": [
  { "Container": "ts", "Type": "Video", "Protocol": "hls",
    "VideoCodec": "h264", "AudioCodec": "aac",
    "Context": "Streaming" }
]
```

> `PlayerEngine.getCapabilities()` 输出能力清单 → `DeviceProfileBuilder` 据此构建。
> 换引擎只换 builder 输入,业务代码不变。详见 [03](03-player-engine.md)。

### URL 拼接

- DirectPlay:`{baseUrl}/Videos/{itemId}/stream?Static=true&MediaSourceId={msId}&api_key={token}&DeviceId=...`
- Transcode:用返回的 `TranscodingUrl`(相对路径)拼 baseUrl。
- 统一由 `EmbyService.resolvePlaybackSource(itemId)` 返回:

```ts
interface PlaybackSource {
  itemId: string
  mediaSourceId: string
  url: string                 // 最终给播放器的 URL
  mode: 'directPlay' | 'directStream' | 'transcode'
  startTicks: number          // 续播起点
  audioStreams: AudioStream[]
  subtitleStreams: SubtitleStream[]
  container: string
}
```

## 2.5 播放进度与会话

让 Emby 显示"继续观看"并跨端同步:

| 时机 | 调用 |
|---|---|
| 开始播放 | `POST /Sessions/Playing` `{ ItemId, MediaSourceId, PlayMethod, PositionTicks }` |
| 周期(每 ~10s)/seek/暂停 | `POST /Sessions/Playing/Progress` `{ ItemId, PositionTicks, IsPaused }` |
| 停止 | `POST /Sessions/Playing/Stopped` `{ ItemId, PositionTicks }` |

- Ticks = 秒 × 10,000,000。
- PlayerController 的状态事件驱动这些回报;节流避免过频。
- 续播:从 `Item.UserData.PlaybackPositionTicks` 取起点 → PlaybackInfo 的 `StartTimeTicks`。

## 2.6 图片与性能

- 列表用小图:`/Items/{id}/Images/Primary?fillHeight=400&quality=90&tag={imageTag}`,带 `tag` 命中 Emby 缓存。
- 详情背景用 `Backdrop`。
- Renderer 侧 `loading="lazy"` + 固定宽高占位防 CLS(对照 web performance 规则)。
- 列表分页 + TanStack Query `keepPreviousData`,滚动加载。

## 2.7 错误码映射

| 场景 | code | UI 文案 |
|---|---|---|
| 401/token 失效 | `EMBY_AUTH_FAILED` | 登录已过期,请重新登录 |
| 服务器不可达 | `EMBY_UNREACHABLE` | 无法连接服务器,检查地址/网络 |
| 非 Emby 服务 | `EMBY_INVALID_SERVER` | 该地址不是有效的 Emby 服务器 |
| PlaybackInfo 无可播放源 | `EMBY_NO_SOURCE` | 该内容暂时无法播放 |
