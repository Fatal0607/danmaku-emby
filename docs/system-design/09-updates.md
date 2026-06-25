# 09 - 应用更新方案

## 1. 目标

DanmakuEmby 需要能基于 GitHub Release 检查是否存在新版本,并逐步演进到应用内下载与安装更新。更新能力分阶段实现,避免在尚未稳定发布打包链路前引入过重的自动更新复杂度。

## 2. 分阶段方案

### 阶段 1: GitHub Release 检查更新

- 主进程请求 GitHub REST API: `/repos/{owner}/{repo}/releases/latest`。
- 使用当前应用版本与 Release `tag_name` 对比。
- 在「设置 → 关于」显示当前版本、发布仓库、检查更新按钮与检查结果。
- 如果发现新版本,展示最新版本、匹配当前平台/架构的推荐 asset,并提供打开 GitHub Release 页面的入口。
- Renderer 不直接访问 GitHub;所有外部网络请求继续留在 Main 进程。

这是当前优先实现的第一步。它不改变安装包,也不自动替换应用本体。

### 阶段 2: 下载并打开安装包

- 沿用阶段 1 的 Release 检查结果。
- 根据平台和架构选择 asset,例如 macOS arm64 优先选择 `*.arm64.dmg`。
- 主进程负责下载安装包到临时目录,Renderer 展示下载进度。
- 下载完成后打开安装包或 Reveal 到 Finder。

此阶段仍然是半自动更新:用户需要完成安装动作。

### 阶段 3: 完整自动更新

- 引入正式打包发布链路,优先考虑 `electron-builder` + `electron-updater`。
- GitHub Release 作为 provider,由 CI 上传安装包和更新元数据。
- 应用内支持检查、下载、安装并重启。
- macOS 分发需要处理代码签名、公证、DMG/ZIP 产物和更新元数据。

该阶段依赖稳定的 GitHub Actions 发布流程,不应在开发启动脚本基础上硬接。

## 3. 第一阶段架构

```
Settings/About
   → useCheckForUpdates()
   → window.api.update.checkForUpdates()
   → IPC update:check
   → UpdateService
   → GitHub Releases API
```

### Main 进程

- `UpdateService` 封装 GitHub Release 请求、版本比较、asset 选择。
- 默认仓库为 `Fatal0607/danmaku-emby`,可通过 `DMEMBY_UPDATE_OWNER` / `DMEMBY_UPDATE_REPO` 覆盖。
- 使用 `app.getVersion()` 读取当前版本。
- `shell.openExternal()` 只允许打开当前仓库的 Release URL。

### Preload / Renderer

- preload 暴露 `window.api.update.current()`、`checkForUpdates()`、`openReleasePage()`。
- Renderer 通过 `UpdateSource` 访问更新能力,浏览器预览使用 mock 数据。
- 设置页「关于」区块只负责展示状态和触发动作。

## 4. 错误处理

- GitHub 不可达、仓库无 Release、响应为空或 JSON 解析失败时,主进程返回 `UPDATE_CHECK_FAILED`。
- Renderer 将错误显示为检查失败状态,不影响设置页其它功能。
- GitHub Release 响应为空时要给出明确错误,避免出现类似 `Unexpected end of JSON input` 的裸异常。

## 5. 后续发布约定

- Release tag 建议使用 `vX.Y.Z`,应用内会归一化为 `X.Y.Z` 比较。
- macOS asset 命名建议包含架构,例如:
  - `DanmakuEmby-0.2.0-arm64.dmg`
  - `DanmakuEmby-0.2.0-x64.dmg`
- 自动安装阶段再要求 CI 产出 electron-updater 所需元数据。

## 6. 参考

- GitHub REST API - Releases: https://docs.github.com/en/rest/releases/releases
- Electron autoUpdater: https://www.electronjs.org/docs/latest/api/auto-updater
- electron-builder Auto Update: https://www.electron.build/auto-update
