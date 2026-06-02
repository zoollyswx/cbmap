# CBMap

CBMap is a Windows desktop application for offline map tile management and downloading. It can render online XYZ-style tile maps, import or draw geographic boundaries, download tiles inside a selected area, and export downloaded tiles to MBTiles for offline use.

## Features

- Manage multiple online tile sources with URL templates such as `{z}/{x}/{y}` and `{s}` subdomains.
- Import boundaries from WKT and GeoJSON files, including FeatureCollections and MultiPolygons.
- Draw rectangle, polygon, and circle boundaries directly on the map.
- Estimate tile counts before downloading.
- Download tiles concurrently with retry handling, skip existing files, and show progress.
- Pack downloaded tiles into MBTiles databases.
- Persist tile sources, boundaries, and default download settings in the Electron user data directory.

## Download For Windows 11 64-bit

The release installer is a Windows self-extracting `.exe` package that installs CBMap under the current user's `%LOCALAPPDATA%\Programs\CBMap` directory and creates desktop and Start menu shortcuts.

For a GitHub release, upload the generated installer from:

```text
release/CBMap Setup 1.0.0 Windows x64.exe
```

After upload, Windows 11 64-bit users can download it from the repository's GitHub Releases page.

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

Build the Windows installer:

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

## Notes

- Tile downloads depend on the availability, licensing, and rate limits of the configured tile provider.
- Some providers return missing tiles or throttle large downloads. CBMap records failed tiles and supports retrying them.
- Downloaded tiles are user data and are not committed to this repository.
