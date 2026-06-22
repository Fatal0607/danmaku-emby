# DanmakuEmby

Emby client with bilibili-style **danmaku** overlay — a cinema-dark, glassmorphism macOS desktop app.

This repo implements the high-fidelity design `DanmakuEmby.dc.html` (cinema-dark + glassmorphism, electric-indigo accent) as a runnable **Electron + Vite + React + TypeScript** app. The renderer runs in the browser for fast preview; the Electron wrapper loads the same build.

## Run

```bash
npm install          # builds the better-sqlite3 native module
npm run dev          # Vite dev server (browser preview, mock data)
npm run electron:dev # build + launch the Electron window
npm run build        # typecheck + production bundle
npm test             # Vitest unit suite (Main-process modules)
```

## What's implemented

The design system + 9 screens from the design comp, all wired through `react-router` (`HashRouter`):

| Route | Screen |
|---|---|
| `/onboarding` | Add server — glass connect card, server rail, connecting state |
| `/` | Home — hero banner, continue-watching / recently-added rows |
| `/library/:kind` | Library grid (movie / series / anime) |
| `/detail/:id` | Media detail — backdrop hero, danmaku match banner, episode grid |
| `/search` | Global search with suggestions |
| `/player/:id` | **Core player** — scrolling danmaku overlay, transport, auto-hiding chrome |
| (in player) | Danmaku settings flyout + manual match modal |
| `/settings` | App settings — servers / playback / danmaku / about |

### Structure

```
src/
├── components/ui/        # Icon, design-system primitives (Button, Slider, Toggle, …)
├── components/media/     # PosterCard
├── features/             # one folder per surface (app-shell, home, player, …)
├── lib/                  # zustand store, mock catalog
└── styles/               # tokens.css (design tokens), page.css
shared/types/             # domain types shared with Main (per architecture §1.3)
electron/                 # minimal main + preload wrapper
```

Design tokens (palette, type scale, radii, motion) live in [`src/styles/tokens.css`](src/styles/tokens.css).

### Main process (`electron/main/`)

Phase-1 backbone per [`docs/system-design/`](docs/system-design/), unit-tested with Vitest:

```
electron/main/
├── AppServices.ts            # composition root (Store + Secrets + EmbyService)
├── emby/
│   ├── EmbyService.ts        # auth, browse, search, PlaybackInfo→PlaybackSource, progress
│   ├── DeviceProfileBuilder.ts  # permissive mpv profile → AC3/DTS/HEVC direct-play
│   └── types.ts              # raw Emby API shapes
├── net/FetchLike.ts          # injectable network layer
├── player/
│   ├── PlayerEngine.ts       # engine interface + mpv/html5 capability sets
│   └── MpvEngine.ts          # libmpv binding site (Spike A — not yet native)
├── danmaku/render/
│   ├── parseComment.ts       # {p,m} parsing, BGR color, ASS escaping
│   └── toAss.ts              # {p,m} → ASS with lane allocation (mpv L1)
├── store/                    # better-sqlite3 db + migrations + repositories
│   └── repositories/         # servers, kv (meta/prefs), danmaku map + cache
├── secret/SecretService.ts   # safeStorage (Keychain) token storage
└── ipc/registerEmbyIpc.ts    # IpcResult envelope + error-code mapping
```

The preload exposes a typed, whitelisted `window.api.emby` bridge; the renderer client
(`src/lib/ipc.ts`) unwraps the `IpcResult` envelope. The screens consume data through a
`DataSource` abstraction (`src/lib/dataSource.ts`): the Emby implementation calls IPC, while a
mock implementation backs the browser preview. TanStack Query hooks (`src/lib/queries.ts`)
provide caching, loading, and error states.

## Status

| Area | State |
|---|---|
| UI (9 screens, design system) | ✅ complete, runs on mock data |
| Emby integration + SQLite + Keychain + secure IPC | ✅ implemented, unit-tested |
| `toAss` danmaku→ASS converter, DeviceProfileBuilder | ✅ implemented, unit-tested |
| Renderer wired to live Emby IPC (TanStack Query, mock fallback in browser) | ✅ done |
| libmpv native binding (Spike A, docs 07 §7.2) | ⬜ next |
| Danmaku network stack (dandanplay/B站/腾讯, manifest) | ⬜ Phase 2–3 |

Run `npm test` for the 27 Main-process unit tests (DeviceProfileBuilder, toAss, EmbyService).
