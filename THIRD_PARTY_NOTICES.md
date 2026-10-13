# Third-party notices

## Marin App Shell

This app vendors the complete, unmodified Marin App Shell distribution in `vendor/marinos/`. Its version, Marin UI baseline, and release-file hashes are recorded in `vendor/marinos/manifest.json`.

Keep the notices distributed with that release:

- `vendor/marinos/licenses/MARIN_APP_SHELL_LICENSE.txt`
- `vendor/marinos/licenses/LUCIDE_LICENSE.txt`
- `vendor/marinos/licenses/OPEN_SANS_OFL.txt`

`vendor/marinos/marinos.css` includes the Pico CSS baseline and its embedded license attribution. Do not strip the notices when updating or redistributing the shell.

## Existing application font assets

Font assets remain under `vendor/fonts/`, outside the replaceable shell directory. Retain their accompanying license information, including `vendor/fonts/open-sans/OFL.txt`. The shell uses these local assets and can fall back to system fonts when they are unavailable.

Add notices for app-specific dependencies here when building the actual workflow.

## PowerPoint export runtime

Marin Learn vendors the reviewed browser distribution of **PptxGenJS 4.0.0** and its bundled **JSZip 3.10.1** runtime under `vendor/pptxgenjs/`. The browser loads them from the same origin only when PowerPoint generation is requested. The Node review adapter executes the same hash-verified vendored bundle. No CDN, npm install, or runtime package download is used.

Retain these files when redistributing or updating the exporter:

- `vendor/pptxgenjs/PPTXGENJS-LICENSE.txt`
- `vendor/pptxgenjs/JSZIP-LICENSE.md`
- `vendor/pptxgenjs/manifest.json`

The manifest records the reviewed file sizes and SHA-256 hashes. A dependency update requires renewed PPTX conformance and manual Microsoft PowerPoint testing; it must not be performed as an incidental application change.
