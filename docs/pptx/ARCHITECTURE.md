# PowerPoint Export Architecture

**Status:** Implemented through PPTX-4

## Pipeline

```text
Marin Learn working package
        │
        ▼
Shared presentation model
js/core/presentation.js
        │
        ▼
Presentation-scoped preflight
js/pptx/preflight.js
        │
        ▼
Deterministic layout plan
        │
        ▼
Editable PptxGenJS output
js/pptx/generate.js
        │
        ▼
OOXML remediation
js/pptx/postprocess.js
        │
        ▼
Structural validation gate
js/pptx/validate.js
        │
        ▼
Validated Uint8Array + manifest
```

The renderer never reads the public-viewer DOM or editor DOM. HTML and PPTX are sibling renderers of the same normalized presentation semantics.

## Module responsibilities

| Module | Responsibility |
|---|---|
| `js/pptx/index.js` | Small public API and mandatory generate → remediate → validate sequence |
| `js/pptx/preflight.js` | Package checks, presentation-scoped diagnostics, cardinality rules, overflow checks, and layout plan |
| `js/pptx/layouts.js` | Layout cardinality, body geometry, columns, media regions, and vertical allocation |
| `js/pptx/markdown.js` | Markdown AST planning and editable PowerPoint object generation |
| `js/pptx/images.js` | Package asset indexing, byte validation, dimensions, data URIs, alt/decorative state, and contain sizing |
| `js/pptx/theme.js` | Single source for slide size, typography, palette, margins, and contrast calculations |
| `js/pptx/generate.js` | PptxGenJS masters, slides, editable objects, notes, and evidence manifest |
| `js/pptx/postprocess.js` | Deterministic corrections PptxGenJS 4.0.0 cannot express directly |
| `js/pptx/validate.js` | OOXML package, metadata, accessibility, fixed-typography, geometry, contrast, and manifest validation |
| `js/pptx/runtime-browser.js` | Lazy same-origin loading of the vendored browser bundle |
| `js/pptx/runtime-node.js` | Hash verification and isolated Node execution of the same vendored bundle |
| `js/pptx/errors.js` | Typed export errors and stable diagnostics |
| `editor/assets/pptx-export.js` | Review and Download selection, preflight presentation, diagnostics, browser download, and focus/busy state |
| `scripts/generate_pptx.mjs` | Canonical-package Node adapter and review-artifact writer |
| `scripts/validate_pptx.py` | Independent standard-library OOXML and manifest validation |
| `scripts/render_pptx.py` | LibreOffice/Poppler PDF, PNG, and montage evidence |
| `scripts/build_pptx_release_fixture.py` | Deterministic package builder for the release-conformance source fixture |
| `scripts/pptx_release_gate.py` | Checksum-bound manual-result evaluation, disposition, report, and evidence packaging |
| `docs/pptx/manual-acceptance-plan.json` | Machine-readable 22-case pilot and production acceptance policy |

## Runtime boundary

The core accepts a runtime object:

```js
{
  PptxGenJS,
  JSZip,
  source
}
```

This keeps generation and remediation independent of how the dependency is supplied.

- In a browser, `runtime-browser.js` lazily loads the reviewed local bundle.
- Unit tests and CI execute that same bundle through `runtime-node.js` in an isolated Node VM.
- The Node adapter verifies the checked-in manifest byte count and SHA-256 hash before execution.
- For SVG, Node retains the embedded vector image and supplies a deterministic transparent PNG compatibility fallback because no browser canvas exists. This policy is recorded in generation summaries and build records.
- No npm package installation or second PptxGenJS copy is required.

The deployed Marin Learn application remains static and requires no Node runtime or build process.

## Vendored dependency

`vendor/pptxgenjs/` contains:

- PptxGenJS 4.0.0 browser distribution;
- bundled JSZip 3.10.1 runtime;
- exact license files;
- a reviewed hash and size manifest.

`tests/pptx-vendor.test.mjs` rejects unreviewed bundle or license drift. Dependency updates require the complete automated conformance suite and the manual Microsoft PowerPoint release gate.

## Why OOXML remediation is mandatory

The conformance investigation demonstrated that direct PptxGenJS 4.0.0 output does not satisfy all Marin requirements. `postprocess.js` therefore performs a small, bounded set of corrections:

1. add or normalize `dc:language` in core properties;
2. assign unique `p:cNvPr` IDs within each applicable presentation part;
3. convert `Decorative:` object names into native Office decorative metadata and remove descriptions;
4. mark every generated table with `firstRow="1"`;
5. apply the presentation language to DrawingML run, paragraph-end, and default-run properties.

The postprocessor operates only on known OOXML parts and records an audit count for every transformation. The structural validator then independently checks the resulting package. The generator cannot bypass either step through the public API.

## Evidence manifest

PptxGenJS generation also returns an internal manifest containing:

- presentation identity, metadata, language, and filename;
- slide dimensions and brand constants;
- source slide order, titles, layouts, notes, and ContentUnit references;
- planned object geometry, typography, color, semantics, and alt/decorative state.

The manifest is not embedded into the canonical package. It gives the structural validator an independent expected-output description for geometry, title text, metadata, contrast, fonts, and overlap checks.

PPTX files may not be byte-identical across executions because ZIP timestamps and Office metadata can vary. Equivalence is evaluated structurally through the manifest and OOXML rather than by whole-file hash.

## Asset flow

```text
marin-asset UUID
    → ImageObject in graph
    → asset contentUrl
    → pkg.assetFiles[path].bytes
    → signature/type/SVG safety validation
    → dimensions + contextual alt state
    → data URI passed to PptxGenJS
    → embedded OOXML media part
```

No filesystem path or remote URL is needed. Informative versus decorative status comes from the Markdown image's contextual alt text, not from the asset record alone.

## Failure boundaries

Diagnostics are separated by responsibility:

- **Source/package failures:** unresolved references, missing bytes, unsafe SVG, or unavailable Markdown.
- **Authoring/layout failures:** missing abstract, duplicate title, unsupported layout cardinality, table limits, or overflow.
- **Exporter-integrity failures:** invalid ZIP/XML structure, metadata mismatch, duplicate IDs after remediation, missing title placeholder, alt-path leak, language failure, or geometry defects.

Source and authoring failures are shown in Review and Download with plain-language diagnostics and **Fix** actions when the affected deck or slide is known. Exporter-integrity failures are treated as internal defects and never produce a downloadable file.

## Browser integration

The editor adapter is intentionally thin:

```text
Review and Download
        │
        ├── list canonical presentations
        ├── run preflight without PptxGenJS
        ├── render blocking errors / nonblocking warnings
        └── author activates Download PowerPoint
                    │
                    ▼
          lazy same-origin runtime load
                    │
                    ▼
          public exporter API pipeline
                    │
                    ▼
            validated Blob download
```

The controller keeps an explicit valid deck selection, otherwise prefers the currently active Slide Decks deck, otherwise uses graph order. It does not store generated files or mutate the package. Re-entering Review and Download reruns preflight against current in-memory data.

The standard browser regression serves the checked-in application over HTTP and therefore exercises the exact meta CSP and the real lazy runtime request. A separately invoked in-memory mode exists only for restricted execution environments that block all browser navigation; it replaces browser storage and runtime loading with test adapters while retaining the actual editor controller, PptxGenJS generation, postprocessor, validator, Blob download, and downloaded OOXML checks.

## Repository review integration

```text
packages/*.zip
      │
      ▼
scripts/generate_pptx.mjs
      │
      ├── validated .pptx
      ├── generation manifest
      ├── production validation JSON
      └── build record and checksums
             │
             ├── scripts/validate_pptx.py
             │      independent OOXML report
             │
             └── scripts/render_pptx.py
                    PDF + slide PNGs + montage
```

`.github/workflows/pptx-review.yml` runs this path for relevant pull requests, pushes to `main`, and manual dispatches. Its permissions are read-only, and it uploads temporary review artifacts rather than deploying them.

## Release-candidate and acceptance integration

```text
tests/fixtures/pptx-release/
        │
        ▼
deterministic fixture ZIP ─────┐
                               │
packages/*.zip ────────────────┤
                               ▼
                    shared Node exporter
                               │
                  independent validation
                               │
                         render evidence
                               │
                               ▼
                   checksum-bound manual record
                               │
              real browser-generated fixture PPTX
                               │
              22 human PowerPoint/AT test results
                               │
                               ▼
          ready-for-controlled-pilot / ready-for-production
                         hold / escalate
```

`.github/workflows/pptx-release-candidate.yml` performs only the automated upper portion. It is manually dispatched for a `pilot` or `production` target, uses read-only permission, and uploads temporary evidence. It does not fabricate human results or evaluate an initialized record as ready.

`scripts/pptx_release_gate.py` evaluates the lower portion. The browser candidate is independently validated against the release-fixture manifest. Human evidence is accepted only when its file paths remain under the manual-record directory, and the final package excludes font files. The resulting decision is explicitly scoped to the recorded files, environment, policies, and tests.

## Deferred release decisions

- public-viewer PowerPoint links;
- copying generated PPTX files into `dist/`;
- catalog metadata for published derivatives;
- automatic continuation slides;
- schema or canonical-package changes.
