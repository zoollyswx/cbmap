# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

CBMap is an Electron desktop app for offline map tile management and downloading. It renders online tile maps (OSM-style), allows users to draw or import geographic boundaries, and downloads tiles within those boundaries for offline use. Downloaded tiles can be exported as MBTiles (SQLite-based format).

Tech stack: **Electron** (main + preload), **Vite** (bundler), **React 18 + TypeScript** (renderer), **Leaflet** (map), **Zustand** (state), **better-sqlite3** (MBTiles packing).

## Commands

```bash
npm run dev            # Start Vite dev server (compiles main/preload to dist-electron/, opens Electron window with HMR)
npm run build          # TypeScript check + Vite production build (outputs dist/ and dist-electron/)
npm run electron:build # Build packaged Windows app into release/win-unpacked
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-iexpress-installer.ps1
                       # Create Windows 11 x64 installer in release/
npm run preview        # Preview production build in browser (no Electron)
```

There are no tests, linters, or format checkers in this project.

## Architecture

### Electron Process (`electron/`)

Vite bundles main and preload via `vite-plugin-electron` (configured in `vite.config.ts`), outputting to `dist-electron/`. In dev mode, the plugin auto-starts Electron after compilation.

- **`main.ts`** — BrowserWindow creation, IPC handler registration, data file initialization (JSON files in `app.getPath('userData')`). Security: `contextIsolation: true`, `nodeIntegration: false`.
- **`preload.ts`** — Exposes `window.electronAPI` via `contextBridge`. All renderer-to-main communication goes through this bridge.
- **`downloader.ts`** — Downloads tiles using a connection-pool worker pattern with configurable concurrency (default 4). Per-tile retry (max 2 retries, 30s timeout). Uses Electron's `net` module. Builds URLs from templates (`{z}/{x}/{y}/{s}`), skips existing files. Sends progress events via `event.sender.send('download:progress', ...)`.
- **`mbtiles.ts`** — Packs downloaded PNG tiles from disk into an `.mbtiles` SQLite database using `better-sqlite3`. Handles TMS Y-axis flip (MBTiles convention is top-to-bottom).
- **`config.ts`** — Simple JSON file read/write helpers.

### Renderer (`src/`)

- **`App.tsx`** — Root component. On mount, loads saved tile sources and boundaries from Electron API. Syncs state back to disk on change (debounced by React batching). Falls back to demo data in browser-only dev mode (no `window.electronAPI`).
- **`store/useStore.ts`** — Single Zustand store with state for `tileSources`, `boundaries`, `downloadTasks`, and UI flags. Contains `detectGroup(name)` for auto-categorizing Chinese administrative region names into 省/市/县/乡镇/其他.
- **`types/index.ts`** — Core interfaces: `TileSource`, `Boundary`, `DownloadConfig`, `DownloadTask`, `TileCoord`, `GeoJSONPolygon`.
- **`types/electron.d.ts`** — TypeScript declaration for `window.electronAPI`.

### Components (`src/components/`)

- **`MapView.tsx`** — Map container (Leaflet). Creates map once, swaps tile layers when `activeSourceId` changes. Renders visible boundaries as GeoJSON overlay. Zooms to boundary extent on selection. Shows tile grid overlay on map for the active boundary (blue rectangles with z/x/y labels).
- **`Sidebar.tsx`** — Left panel with tile source list, boundary list (grouped, searchable, with batch operations, color/opacity controls, favorites, drag-to-reorder via arrow buttons), and download trigger button.
- **`DrawToolbar.tsx`** — Custom drawing tools (rectangle, polygon, circle) using direct Leaflet mouse event handlers. Saves drawn shapes as `Boundary` objects with `group: '绘制'`.
- **`DownloadDialog.tsx`** — Download configuration panel: save directory, naming format presets, zoom range, concurrency selector, buffer distance (km), tile count estimation. For MultiPolygon boundaries or non-zero buffer, downloads the full bbox extent instead of polygon-clipped tiles. Triggers download via IPC, shows progress bar, supports retry of failed tiles.
- **`TileSourceForm.tsx`** — Modal form for adding/editing tile sources (URL template with `{z}/{x}/{y}/{s}` placeholders, subdomains, opacity, label layer).
- **`BoundaryImporter.tsx`** — Import boundaries from WKT files or GeoJSON files (including FeatureCollections).
- **`StatusBar.tsx`** — Bottom bar showing current lat/lng/zoom.

### Utility Modules (`src/utils/`)

- **`tileMath.ts`** — Coordinate transforms (lon/lat ↔ tile x/y), bbox-to-tile-range calculation, tile list generation, tile count estimation.
- **`tileClip.ts`** — Point-in-polygon test (ray casting) for filtering tiles to polygon boundaries. `filterTilesByPolygon()`, `getPolygonBBox()`.
- **`wktParser.ts`** — Simple WKT parser (POLYGON/MULTIPOLYGON → GeoJSON). Also `extractAllPolygons()` for parsing GeoJSON FeatureCollections with Chinese property name extraction.

## Data Flow

1. User adds tile sources (URL templates) and boundaries (imported WKT/GeoJSON or drawn).
2. App persists them as JSON files in Electron's `userData` directory via IPC.
3. User selects a tile source + boundary → opens download dialog.
4. `DownloadDialog` calculates tiles by: get polygon bbox → generate all tiles in zoom range → filter by point-in-polygon test.
5. Download starts → main process downloads tiles concurrently → progress sent back via IPC.
6. (Later) User can pack downloaded tiles into `.mbtiles` format.

## Key Conventions

- All imports from `src/` use `@/` alias (configured in both vite.config.ts and tsconfig.json).
- The app works in two modes: Electron (with `window.electronAPI`) and browser dev (`npm run dev` standalone, uses demo data).
- Boundary `group` field is auto-detected from Chinese naming patterns (`detectGroup()`) if not explicitly set.
- Tile data is persisted only when `window.electronAPI` is available.
- The map is never destroyed on source switch — only tile layers are replaced.
