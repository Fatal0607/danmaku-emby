# 03 · 播放引擎

## 3.1 无声问题根因(必须理解)

Chromium 自带 ffmpeg 是**裁剪版**,出于专利授权移除了多种音频解码器。影视/番剧常见音轨恰好命中:

| 编码 | 常见于 | Chromium |
|---|---|---|
| AC3 / E-AC3(Dolby) | 几乎所有电影、压制番 | ❌ |
| DTS / DTS-HD / TrueHD | 蓝光原盘、高码率 | ❌ |
| AAC / MP3 / Opus | 网络流 | ✅ |
| HEVC/H.265(视频) | 4K/新压制 | ⚠️ 部分/需硬件 |

现象:H.264 画面能放,但音轨是 AC3/DTS → **静音**;或 MKV 容器 + HEVC → 整段失败。

## 3.2 三条解决路径与取舍

| 方案 | 做法 | 优 | 劣 | 定位 |
|---|---|---|---|---|
| **C 内嵌 mpv** | libmpv 原生解码,什么都能直通 | 根治无声;原音质;服务器零压力 | 工程量大;macOS 窗口嵌入+弹幕叠加需处理 | **主力,MVP 即采用** |
| **A 改服务端** | HTML5 + DeviceProfile 让 Emby DirectStream 仅转音频为 AAC | 实现快,弹幕叠加最简单 | 吃服务器 CPU;无原音直通;有损 | **可选回退(非 MVP)**:mpv 不可用环境的降级 |
| **B 换 libffmpeg** | 替换 Electron 的 `libffmpeg.dylib` 为完整编译版 | 补回 HEVC/AAC | AC3/DTS 仍专利雷区;升级即重编;脆 | **不采用** |

> **决策:MVP 直接采用方案 C(内嵌 mpv)。** 保留 `PlayerEngine` 抽象与 `Html5Engine` 实现仅为
> 测试/极端降级用途,不在 MVP 主交付路径;弹幕在 MVP 即走 mpv→ASS(L1)渲染。

> 参考:Jellyfin Media Player(Emby 分支生态)即「Chromium WebView 跑 Web UI + 原生 mpv 播放 + JS↔原生桥」架构,直接验证了路径 C 的可行性。

## 3.3 播放器抽象接口

MVP 即采用 mpv;保留统一引擎接口是为了可测试性与极端环境降级,业务/UI 不感知具体引擎:

```ts
// electron/main/player/PlayerEngine.ts
export interface PlayerCapabilities {
  videoCodecs: string[]
  audioCodecs: string[]
  containers: string[]
  subtitleFormats: string[]
  hardwareDecode: boolean
}

export interface PlayerEngine {
  getCapabilities(): PlayerCapabilities
  load(src: PlaybackSource): Promise<void>
  play(): void
  pause(): void
  seek(seconds: number): void
  setAudioTrack(index: number): void
  setSubtitle(index: number | null): void
  // mpv 专用:把弹幕作为 ASS overlay 加载(html5 实现为 no-op)
  loadAssOverlay?(assText: string): void
  on(event: 'timeupdate' | 'ended' | 'pause' | 'play' | 'error',
     cb: (payload: PlayerStateEvent) => void): void
  dispose(): void
}
```

- `MpvEngine`(**MVP 默认**):能力宽松(见 02 的 mpv DeviceProfile)→ 直通,原音质零转码。
- `Html5Engine`(可选降级,非 MVP):能力保守(h264/aac/vp9…)→ 触发服务端兼容转码。
- `PlayerController` 持有当前 `PlayerEngine`,`DeviceProfileBuilder` 用其 `getCapabilities()` 生成 profile。**切换引擎只改注入,EmbyService/UI 不变。**

## 3.4 mpv 集成方案(macOS)

最大工程不确定点,**应作为最早的技术验证 spike**(见 07)。三种集成层次:

### (1) 控制方式
- **进程 + JSON IPC(起步快)**:启动 `mpv --input-ipc-server=/tmp/dmemby.sock --idle ...`,通过 unix socket 收发命令/事件(`loadfile`、`set_property pause`、`observe_property time-pos`)。可用 `node-mpv` 之类封装。
- **libmpv 原生 addon(进阶)**:N-API 绑定 libmpv,`mpv_command`/`mpv_observe_property`,延迟更低、控制更细。

### (2) 渲染/窗口嵌入(macOS 难点)
按从易到难,**推荐顺序落地**:

| 层次 | 做法 | 弹幕叠加 | 难度 |
|---|---|---|---|
| **L1 子窗口 + ASS** | mpv 自有窗口播放;弹幕转 ASS 交 mpv(libass)渲染 | mpv 内部画,无叠加难题 | ★★ |
| **L2 子窗口 + 透明叠加窗** | macOS `addChildWindow`:mpv 窗 + 置顶透明 Electron 窗画 HTML 弹幕/控制条 | HTML/Canvas,灵活 | ★★★ |
| **L3 render API 内嵌** | libmpv render API 渲染进 Electron 的 OpenGL/Metal/canvas,弹幕同 DOM 叠加 | 同 DOM,最佳 UX | ★★★★ |

**推荐路径:L1 先打通可播 + 弹幕可见 → L2 拿到灵活 HTML 弹幕和统一控制条 → 视需要再上 L3。**

### (3) 同步与控制
- 播放/暂停/seek/音轨/字幕轨全部经 `PlayerController` 下发 mpv。
- `observe_property time-pos` → 节流后经 `PLAYER_STATE` 推 Renderer,驱动:① 弹幕时间轴;② Emby 进度回报。
- 硬件解码:macOS 用 `--hwdec=videotoolbox`。
- 音频直通(可选,接 AVR/Soundbar):`--audio-spdif=ac3,dts` 或保持解码到 PCM。

## 3.5 弹幕渲染与播放器的绑定关系

| 引擎/层次 | 弹幕渲染 | 同步源 |
|---|---|---|
| HTML5 `<video>`(方案A) | Canvas/CSS 叠加,同 DOM | `video.currentTime` |
| mpv L1 | **{p,m}→ASS** 交 libass | mpv 时间轴(帧级精确) |
| mpv L2 | 透明窗内 Canvas | mpv `time-pos` 事件 |
| mpv L3 | 同 DOM Canvas | mpv `time-pos` 事件 |

ASS 转换见 [04 · 4.6](04-danmaku.md)。Canvas 渲染引擎可自绘或用 `danmaku`/`CommentCoreLibrary`,需支持滚动/顶部/底部弹幕、密度限制、透明度/字号/速度配置(存 SQLite,见 05)。

## 3.6 暴露给上层的能力声明示例

```ts
// MpvEngine.getCapabilities()
{
  videoCodecs: ['h264','hevc','vp9','av1','mpeg2video','mpeg4','vc1'],
  audioCodecs: ['aac','ac3','eac3','dts','dts-hd','truehd','flac','mp3','opus','pcm','vorbis'],
  containers: ['mkv','mp4','avi','ts','m2ts','flv','webm','mov','wmv'],
  subtitleFormats: ['ass','srt','pgssub','dvdsub'],
  hardwareDecode: true,
}
```

→ 喂给 `DeviceProfileBuilder` 即得到 02 中的宽松直通 profile。
