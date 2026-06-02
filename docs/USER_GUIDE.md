# CBMap User Guide

## Install

1. Download `CBMap Setup 1.0.0 Windows x64.exe` from the GitHub Releases page.
2. Run the installer on Windows 11 64-bit.
3. Choose an installation directory when prompted.
4. Start CBMap from the Start menu or desktop shortcut.

## Add A Tile Source

1. Open the tile source panel.
2. Add a source name and URL template.
3. Use placeholders supported by the app:
   - `{z}` zoom level
   - `{x}` tile column
   - `{y}` tile row
   - `{s}` optional subdomain
4. Save the source and select it as the active map layer.

Example ArcGIS imagery template:

```text
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

## Import Or Draw Boundaries

CBMap supports:

- WKT `POLYGON` and `MULTIPOLYGON`
- GeoJSON `Polygon`, `MultiPolygon`, `Feature`, and `FeatureCollection`
- Drawn rectangles, polygons, and circles

Imported boundaries are grouped automatically when Chinese administrative names can be detected.

## Download Tiles

1. Select a tile source.
2. Select a boundary.
3. Open the download dialog.
4. Choose a save directory.
5. Select the minimum and maximum zoom levels.
6. Set concurrency based on the provider and network quality.
7. Confirm the estimated tile count.
8. Start the download.

If a buffer distance is enabled, CBMap downloads the expanded bounding-box area. For MultiPolygon boundaries, CBMap downloads the full bounding box that contains all polygon parts.

## Retry Failed Tiles

Failed tiles can happen when a provider times out, rate limits requests, or does not have imagery for a coordinate. CBMap retries temporary failures automatically and records the remaining failed coordinates for manual retry.

## Export MBTiles

Use the MBTiles export function after tiles have been downloaded. The app packs PNG tiles into a SQLite-based `.mbtiles` database and applies the MBTiles Y-axis convention.
