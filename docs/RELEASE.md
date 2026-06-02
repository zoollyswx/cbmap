# Release Guide

## Build A Windows Installer

Run:

```bash
npm install
npm run electron:build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-iexpress-installer.ps1
```

Expected output:

```text
release/CBMap Setup 1.0.0 Windows x64.exe
release/CBMap-1.0.0-Windows-x64.zip
```

The `.exe` file is the installer for Windows 11 64-bit users. It installs CBMap into `%LOCALAPPDATA%\Programs\CBMap` and creates desktop and Start menu shortcuts.

If `npm run electron:build` fails while extracting `winCodeSign` with a message about missing symbolic-link privileges, run Windows with Developer Mode enabled or use an elevated shell. The IExpress installer script can still package an existing `release/win-unpacked` directory.

## Publish On GitHub

1. Create a new independent GitHub repository, for example `cbmap`.
2. Push this local repository to GitHub:

```bash
git remote add origin https://github.com/<owner>/cbmap.git
git branch -M main
git push -u origin main
```

3. Create a release tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

4. Open the GitHub repository in a browser.
5. Go to **Releases** -> **Draft a new release**.
6. Select tag `v1.0.0`.
7. Upload `release/CBMap Setup 1.0.0 Windows x64.exe` as a release asset.
8. Publish the release.

## Suggested Release Notes

```markdown
## CBMap 1.0.0

Initial Windows release.

- Offline tile download management for XYZ-style map sources.
- WKT and GeoJSON boundary import.
- Drawing tools for custom download areas.
- Tile count estimation, concurrent downloads, retry handling, and skipped-file detection.
- MBTiles export support.
- Optimized failed-tile handling to avoid long delays on unavailable or throttled tiles.

Download `CBMap Setup 1.0.0 Windows x64.exe` for Windows 11 64-bit.
```
