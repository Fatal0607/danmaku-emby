# DanmakuEmby

Emby client with bilibili-style **danmaku** overlay — a cinema-dark, glassmorphism macOS desktop app.

This repo implements the high-fidelity design `DanmakuEmby.dc.html` (cinema-dark + glassmorphism, electric-indigo accent) as a runnable **Electron + Vite + React + TypeScript** app. The renderer runs in the browser for fast preview; the Electron wrapper loads the same build.

## Run

```bash
npm install
npm run dev          # Vite dev server (browser preview)
npm run electron:dev # build + launch the Electron window
npm run build        # typecheck + production bundle
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

## Status

UI layer is complete and runs on **mock data** (`src/lib/mockData.ts`). The Main-process services
(EmbyService, DanmakuService, PlayerController with libmpv, SQLite store) described in
[`docs/system-design/`](docs/system-design/) are not yet wired — the preload bridge is a typed
placeholder ready for those IPC namespaces.
