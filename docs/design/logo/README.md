# Canonical VibeFlare logo pack

These nine PNG files were supplied by the user on 2026-09-13. Their original filenames and bytes are preserved for future design work; `manifest.json` records their SHA-256 hashes and dimensions. They are design sources, not public runtime payloads.

## Selected runtime artwork

- Horizontal transparent lockup: `ChatGPT Image Sep 13, 2026, 03_21_54 PM (3).png`. Used instead of the former blue letter tile and typed wordmark in the authentication header, workspace sidebar and React design-system shell.
- Transparent VF symbol: `ChatGPT Image Sep 13, 2026, 03_22_00 PM (9).png`. Used in the compact page header, browser favicons, touch icon and interactive dot logo.
- Other horizontal, stacked, dark-background and light-background variants are retained unchanged as alternate source artwork.

Generated files are under `apps/ui/public/assets/brand/` and the public icon paths. Cropping removes transparent padding and extremely faint alpha noise only; artwork is not redrawn. All versions preserve source colors and proportions. `tools/build-logo-assets.py` (Pillow) reproduces the derivatives and dot-grid data. `node tools/verify-logo-assets.mjs` checks source/runtime hashes, source relationships and the total size budget without Python dependencies.

The standard 320px transparent wordmark is used for ordinary navigation; its 640px counterpart serves high-DPI screens. The complete generated runtime pack is under128 KB. Only the dedicated auth illustration animates; the navigation logos remain static.
