# 06 · 安全与风险

## 6.1 Electron 安全基线

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`(Renderer)。
- preload 只经 `contextBridge` 暴露**白名单 typed API**,不透传 `ipcRenderer`。
- 校验所有 IPC 入参(schema),Renderer 视为不可信边界。
- `webSecurity` 保持开启;外部内容(登录窗)用独立 `session` 隔离。
- 仅加载本地打包资源;禁用 `allowRunningInsecureContent`;限制 `window.open`。
- 自动更新走签名校验(如 electron-updater + 代码签名/公证 notarization,macOS 必需)。

## 6.2 凭据与密钥管理

| 敏感项 | 处理 |
|---|---|
| Emby AccessToken | **`safeStorage`(macOS Keychain)加密**,键 = serverId;SQLite 不存明文 |
| 用户密码 | 仅登录时内存使用,登录后即丢弃,**不持久化** |
| 弹弹play `appSecret` | **绝不放客户端**(扩展/Electron 都可被逆向);走自家 proxy 服务端代签 |
| B站/腾讯 Cookie | 由用户在登录窗自行登录,存于 Electron `session`,不收集账号密码 |

启动时校验必需密钥存在;Keychain 不可用时降级提示并要求重新登录(不静默明文存)。

## 6.3 Cookie 复用(B 站 / 腾讯)

- `CookieAuthService` 用独立 `BrowserWindow` + 专用 `session` 加载 `bilibili.com` / `v.qq.com`。
- 用户登录后,后台请求经同一 session `net.fetch` 自动携带分区 Cookie(`credentials: include`)。
- **只复用用户主动登录产生的 Cookie,绝不抓取/外传账号凭据。**
- `loginProbe` 检测登录态,失效时引导重新登录,不缓存敏感 Cookie 到 SQLite。

## 6.4 网络与请求安全

- 全部外部请求在 Main;Renderer 无外网能力(降低 XSS 危害)。
- `rewriteHeaders` 仅用于平台要求的 `Referer`/`Origin`(临时 session rule,用完移除)。
- Emby 优先 HTTPS;允许用户信任自签证书时显式确认,不默认忽略 TLS 错误。
- 弹幕文本渲染**严格转义**(Canvas 文本天然安全;若用 DOM,禁止 `innerHTML`,见 web security 规则)。

## 6.5 平台接口稳定性风险(方案文档第 13 节)

B 站/腾讯 Web API 非稳定 SDK,风险:路径/参数/签名/反爬/响应结构变化。缓解:
- **manifest 热更新**:接口变只更 JSON,不重发客户端。
- 每平台维护 fixture 测试(搜索/剧集/弹幕)+ 定期真实 smoke test。
- 失败回退本地缓存,不阻塞已下载弹幕播放。
- 解码失败 → `DM_PARSE_FAILED`,上报并提示等待源更新。

## 6.6 请求频率与风控

- 严格保留节流(B站 protobuf `throttleMs=200`/顺序;腾讯 segment `concurrency=4`/`throttleMs=100`)。
- 全局请求限速 + 退避重试(指数退避,尊重 429/304)。
- 同一弹幕集命中缓存即不再打接口。

## 6.7 专利与合规

- **不内置专利编解码器进 libffmpeg**(避免 B 方案的法律灰色);用 mpv/系统能力解码,职责在播放引擎而非自带编码库。
- HEVC 解码优先走 macOS VideoToolbox 硬件(系统授权)。
- 弹幕源 manifest 与平台数据:仅做客户端解析展示,不二次分发/不商用;尊重平台条款,提供来源标识。
- macOS 分发需代码签名 + 公证。

## 6.8 隐私

- 不收集用户观看数据外传;进度回报仅发往用户自己的 Emby 服务器。
- 日志不含 token/cookie/密码;崩溃上报(若有)脱敏。

## 6.9 风险登记表

| 风险 | 等级 | 缓解 |
|---|---|---|
| mpv macOS 窗口嵌入复杂度 | 高 | 早做 spike(07);L1→L2→L3 渐进,L1 即可交付 |
| 平台接口变更致弹幕失效 | 高 | manifest 热更新 + fixture + 缓存兜底 |
| AC3/DTS 专利合规 | 中 | 用 mpv/系统解码,不自带编码库 |
| Emby/Jellyfin API 差异 | 中 | 接口抽象,先 Emby 后兼容 |
| dandanplay 签名泄露 | 中 | proxy 代签,密钥不入客户端 |
| 弹幕量大致渲染卡顿 | 中 | 密度限制 + libass/Canvas GPU + 离屏计算 |
