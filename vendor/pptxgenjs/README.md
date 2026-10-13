# Vendored PowerPoint runtime

This directory contains the browser bundle used by Marin Learn's PowerPoint exporter.

- PptxGenJS: 4.0.0
- JSZip represented in the bundle: 3.10.1
- Browser use: loaded on demand by `js/pptx/runtime-browser.js`
- Node/CI use: hash-verified and executed by `js/pptx/runtime-node.js`
- Network behavior: same-origin browser load; no CDN, npm install, or runtime package download

`manifest.json` records exact sizes and SHA-256 hashes. Update the bundle, license files, manifest, conformance evidence, and manual PowerPoint regression results together. Do not replace this dependency as an incidental application change.

The bundle is not loaded by the viewer or editor during normal startup. Browser export loads it only after author activation. Repository review generation uses the same checked-in bytes through the Node adapter.
