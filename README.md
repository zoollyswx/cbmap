# CBMap

> Windows offline map tile downloader and MBTiles packing tool.

[![Release](https://img.shields.io/github/v/release/zoollyswx/cbmap?label=download)](https://github.com/zoollyswx/cbmap/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%2011%20x64-blue)](https://github.com/zoollyswx/cbmap/releases/latest)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848f)](https://www.electronjs.org/)

CBMap is a Windows desktop tool for downloading offline map tiles by boundary. It supports online XYZ-style tile sources, WKT/GeoJSON boundary import, map drawing tools, concurrent downloads, failed-tile retry, and MBTiles export.

![CBMap main preview](docs/assets/cbmap-main-preview.png)

## 中文简介

CBMap 是一个 Windows 离线地图瓦片下载工具。你可以导入 WKT/GeoJSON 边界，或直接在地图上绘制范围，然后按指定缩放级别批量下载瓦片，并可将下载结果打包为 MBTiles。它适合 GIS、规划、测绘、通信、应急保障和离线地图数据制作场景。

## Download

**Windows 11 64-bit installer:**

[Download CBMap 1.0.1 for Windows x64](https://github.com/zoollyswx/cbmap/releases/download/v1.0.1/CBMap.Setup.1.0.1.Windows.x64.exe)

File verification:

```text
SHA256: F77FA9D0E0D74B3A806ABD13BE6E8CE596A052232F0FFCE337E92242E35B7FA5
Size:   141,758,464 bytes
```

The installer is unsigned. Windows SmartScreen may show a warning on first run; choose "More info" -> "Run anyway" only if the SHA256 hash matches the value above.

## Who Is It For

CBMap is useful for GIS, planning, surveying, telecom, emergency response, and data analysis workflows where map tiles need to be downloaded for a defined area and used offline.

Typical use cases:

- Download imagery or base-map tiles for a province, city, site polygon, or custom drawn area.
- Import administrative boundaries from WKT or GeoJSON and generate tile folders.
- Build offline tile datasets for internal map systems.
- Package downloaded PNG tiles into MBTiles.

## Quick Start

1. Install CBMap from the Windows x64 installer.
2. Add a tile source URL template, for example:

```text
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

3. Import a WKT/GeoJSON boundary or draw an area on the map.
4. Choose zoom range, save directory, concurrency, and optional buffer distance.
5. Start the download and retry failed tiles if the provider times out or rate limits requests.

## Features

- Tile source management with `{z}`, `{x}`, `{y}`, and `{s}` URL placeholders.
- WKT and GeoJSON import, including FeatureCollections and MultiPolygons.
- Rectangle, polygon, and circle drawing tools.
- Boundary grouping, search, favorites, visibility, color, and opacity controls.
- Tile count estimation before download.
- Concurrent tile downloads with timeout, retry, skipped-file detection, and progress reporting.
- MBTiles export based on downloaded PNG tiles.
- Local JSON persistence through Electron user data.

## Important Notes

- Tile availability, rate limits, and licensing depend on the configured tile provider.
- Large downloads may trigger provider throttling. Reduce concurrency if many requests fail with timeouts or `429` responses.
- Downloaded tiles are saved locally and are not part of this repository.
- The app currently targets Windows 11 x64.

## Development

Requirements:

- Windows 11 64-bit
- Node.js 18 or newer
- npm

Install dependencies:

```bash
npm install
```

Start the Electron development app:

```bash
npm run dev
```

Build the renderer and Electron main/preload bundles:

```bash
npm run build
```

Build the Windows release package:

```bash
npm run electron:build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-iexpress-installer.ps1
```

## Project Structure

```text
electron/       Electron main process, preload bridge, tile downloader, MBTiles packer
src/            React renderer application
src/components/ Map, sidebar, import, drawing, and download UI components
src/utils/      Tile math, polygon clipping, and WKT/GeoJSON parsing helpers
docs/           User and release documentation
```

## License

No license has been selected yet. Add a license before encouraging broad third-party reuse or redistribution.
