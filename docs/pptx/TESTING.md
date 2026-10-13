# PowerPoint Export Testing

**Status:** PPTX-4 automated core, browser UI, Node/CI, deterministic release fixture, independent validation, render evidence, and auditable manual release gate implemented

## Standard checks

From the repository root:

```bash
bash scripts/check.sh
```

This performs JavaScript syntax checks, verifies the vendored dependency manifest and licenses, runs every Node test, and runs the Python security, package, publication, template, Node-adapter, independent-PPTX-validator, deterministic release-fixture, and release-gate tests. It does not require LibreOffice.

The browser suite includes the PowerPoint authoring workflow:

```bash
bash scripts/check.sh --browser
```

The standard PowerPoint browser test serves the checked-in application over HTTP. It therefore exercises the real meta Content Security Policy, same-origin dynamic runtime load, browser Blob download, and production module graph.

A restricted execution environment that blocks all browser navigation may run the component-equivalent fallback directly:

```bash
python3 tests/browser_pptx_export.py --in-memory
```

The fallback uses real Chromium, the actual editor controller, the reviewed PptxGenJS bundle, OOXML postprocessor, validator, and downloaded file checks. It substitutes only browser storage and dynamic script loading so it does not replace the standard CSP/same-origin test in normal CI.

## Repository review commands

Generate all canonical package presentations with the same exporter used by the browser:

```bash
node scripts/generate_pptx.mjs packages \
  --out build/pptx-review \
  --summary build/pptx-review/results.json
```

Run the independent validator and retain per-deck sidecars:

```bash
python3 scripts/validate_pptx.py build/pptx-review \
  --require-manifest \
  --write-sidecars \
  --out build/pptx-review/independent-validation.json
```

When LibreOffice, Poppler, and ImageMagick are available, render review evidence:

```bash
python3 scripts/render_pptx.py build/pptx-review \
  --out build/pptx-rendered \
  --summary build/pptx-rendered/render-results.json
```

The `Build PowerPoint review artifacts` GitHub Actions workflow runs these commands and uploads `build/pptx-review` and `build/pptx-rendered`. It does not deploy either directory.

## Release-candidate commands

Build the deterministic release fixture:

```bash
python3 scripts/build_pptx_release_fixture.py \
  --out build/pptx-fixtures/pptx-release-conformance.zip \
  --summary build/pptx-fixtures/results.json
```

Generate every current package deck plus the fixture, then independently validate and render them:

```bash
node scripts/generate_pptx.mjs \
  packages \
  build/pptx-fixtures/pptx-release-conformance.zip \
  --out build/pptx-review \
  --summary build/pptx-review/results.json

python3 scripts/validate_pptx.py build/pptx-review \
  --require-manifest \
  --write-sidecars \
  --out build/pptx-review/independent-validation.json

python3 scripts/render_pptx.py build/pptx-review \
  --out build/pptx-rendered \
  --summary build/pptx-rendered/render-results.json
```

Initialize a checksum-bound human test record:

```bash
python3 scripts/pptx_release_gate.py init \
  --review build/pptx-review \
  --render build/pptx-rendered \
  --target pilot \
  --out build/pptx-release/manual-results.json
```

After the browser fixture and all required human results are recorded, evaluate the release and optionally package the evidence:

```bash
python3 scripts/pptx_release_gate.py evaluate \
  --review build/pptx-review \
  --render build/pptx-rendered \
  --manual build/pptx-release/manual-results.json \
  --out build/pptx-release/release-decision.json \
  --report build/pptx-release/RELEASE-DECISION.md \
  --package build/pptx-release/marin-learn-pptx-release-evidence.zip
```

A newly initialized record is expected to produce `hold`; that is the correct state until the human tests are completed. The dispatch-only `Build PowerPoint release candidate` workflow performs the automated portion and uploads the candidate evidence without publishing it.

## PPTX-specific automated coverage


### `tests/pptx-editor-ui.test.mjs`

- selected-deck precedence and invalid-selection fallback;
- plain-language slide context and removal of repeated context in rendered diagnostics;
- required Review and Download controls and explanatory content;
- lazy runtime contract: the runtime bundle is not included in editor HTML;
- editor wiring to active slide-deck selection, presentation-scoped preflight, busy state, focus restoration, and browser download.

### `tests/browser_pptx_export.py`

- accessible PowerPoint region and control names;
- no-deck empty state and keyboard activation of **Open Slide Decks**;
- automatic selection of an imported presentation;
- preflight without loading PptxGenJS;
- nonblocking warning state with enabled download;
- blocking duplicate-title diagnostic with disabled download and **Fix** routing;
- internal generation failure with no download, no authoring **Fix**, retry availability, and focus on the failure heading;
- `aria-busy`, disabled controls, and stable busy label during generation;
- valid `.pptx` download name, ZIP structure, slide count, notes count, and document language;
- successful live status and focus return to **Download PowerPoint**;
- no mutation of the in-memory learning package or local-save status;
- narrow-screen horizontal reflow;
- in standard mode, exactly one same-origin runtime request and no PPTX CDN request.

### `tests/pptx-export.test.mjs`

- imports every current published Marin Learn package;
- resolves and preflights every presentation;
- exports each presentation through the complete production pipeline;
- checks that source packages are not mutated;
- verifies valid ZIP signatures, filenames, slide counts, and validation results;
- proves raw PptxGenJS output fails known required OOXML checks;
- proves remediation corrects language, decorative objects, table headers, and run language;
- checks informative-image alt text, hyperlinks, title text, widescreen geometry, notes, metadata, and the absence of automatic text fitting;
- rejects duplicate titles, missing abstracts, excessive split content, unresolved images, and overflow;
- verifies OOXML helper determinism.

### `tests/pptx-markdown.test.mjs`

- nested-list order without duplicated content;
- external hyperlinks versus noninteractive internal references;
- fixed font-size planning and deterministic overflow reporting.

### `tests/pptx-images.test.mjs`

- safe package-local SVG preparation and dimensions;
- contextual informative alternative text;
- blocking of active SVG content before generation.

### `tests/pptx-runtime.test.mjs`

- reuse of an existing reviewed runtime;
- lazy loading of exactly one same-origin script;
- rejection of partial runtimes.

### `tests/pptx-vendor.test.mjs`

- exact dependency versions;
- byte sizes and SHA-256 hashes;
- required license files;
- local runtime path and absence of an external source-map dependency.

### `tests/pptx-node.test.mjs`

- Node runtime manifest and SHA-256 verification;
- reuse of the exact vendored browser bundle without npm installation;
- canonical ZIP import and complete review sidecar generation;
- presentation-selector failure behavior;
- deterministic package discovery and CLI arguments;
- destructive-output cleanup safeguards;
- workflow isolation from GitHub Pages deployment and failure-evidence retention.

### `tests/test_pptx_release.py`

- deterministic, safe release-fixture packaging;
- Node generation of a fixture containing SVG, tables, hyperlinks, informative and decorative images, notes, Unicode, all layouts, and all display modes;
- independent validation of the generated fixture;
- expected `hold` for an incomplete manual record;
- controlled-pilot and production ready dispositions for complete synthetic gate records;
- rejection of stale file hashes, stale browser-source hashes, unknown tested-file keys, and incomplete conditional dispositions;
- evidence-package checksums and explicit font-file exclusion.

### `scripts/build_pptx_release_fixture.py`

- sorted ZIP entries;
- fixed timestamps and permissions;
- rejection of symlinks, unexpected top-level paths, and unsafe output locations;
- exact LearningSet and Presentation identity checks;
- reproducible package bytes and SHA-256.

### `scripts/pptx_release_gate.py`

- agreement among generation, independent-validation, and render summaries;
- per-deck SHA-256, slide-count, sidecar, and fixture-presence checks;
- checksum binding between the manual record and the exact candidate files;
- independent validation of the real browser-generated fixture;
- enforcement of 22 required or conditional human cases;
- evidence-file, screen-reader, font-policy, identity-approval, supported-environment, and content-owner requirements;
- `ready-for-controlled-pilot`, `ready-for-production`, `hold`, and `escalate` dispositions;
- deterministic evidence ZIP with `SHA256SUMS` and no font files.

### `tests/test_pptx_ci.py`

- command-line generation of a real package presentation;
- independent Python validation of valid output;
- deliberate missing-language and duplicate-ID rejection;
- unsafe and duplicate ZIP-member rejection before extraction;
- combined and per-deck validator reports;
- renderer discovery and slide-count helpers without requiring rendering tools during ordinary checks.

## Required generated-output checks

For development changes to layout, Markdown rendering, image handling, theme values, PptxGenJS, or OOXML remediation:

1. Generate all current published decks through `exportPresentationToPptx()`.
2. Run the production structural validator and retain its JSON evidence.
3. Render every generated deck through LibreOffice or Microsoft PowerPoint.
4. Inspect a montage and each slide at full size.
5. Run the slide-canvas overflow detector.
6. Confirm no repair warning appears when opened in Microsoft PowerPoint.

A visual review must check:

- clipping or overflow;
- unintended overlaps;
- title and body hierarchy;
- consistent margins and columns;
- list indentation and numbering;
- table legibility;
- image aspect ratio;
- footer and slide-number placement;
- light/dark source assets against the white slide canvas;
- content fidelity against the Marin Learn source.

## Negative-test requirement

A validator is not accepted merely because it passes a valid deck. Tests must retain deliberate failures that demonstrate rejection of:

- missing language metadata;
- decorative objects without native decorative metadata;
- tables without first-row header metadata;
- duplicate nonvisual IDs;
- missing informative image alt text;
- local path or data-URI leakage;
- missing or incorrect title placeholders;
- automatic text fitting that could shrink authored typography;
- metadata mismatch;
- out-of-bounds objects, severe overlaps, insufficient contrast, and unapproved fonts in the generation manifest;
- source/layout overflow and unsupported cardinality.

## Manual release gate

The normative human plan is `docs/pptx/manual-acceptance-plan.json`; the readable procedure is `docs/pptx/MANUAL-ACCEPTANCE.md`. The 22 cases cover current County-supported PowerPoint desktop, Accessibility Checker, Selection and Reading Order panes, screen-reader traversal, tables, lists, images, decorative state, links, notes, language, installed and missing fonts, round-trip editing, supported PowerPoint variants, official identity approval, projection/grayscale behavior, derivatives, and substantive content review.

`scripts/pptx_release_gate.py` binds those results to the exact generated deck hashes, slide counts, fixture source package, and browser-generated candidate. It rejects stale or unknown file references, missing required evidence, required tests that are not `pass`, and conditional tests that are neither passed nor explicitly marked `not_applicable` with a reason.

Run the complete gate before first pilot release and whenever PptxGenJS, JSZip, the runtime adapters, OOXML remediation, layout geometry, Markdown rendering, image/SVG handling, brand values, font policy, supported PowerPoint versions, or derivative/publication policy changes.

A ready disposition records the tested scope only. It does not establish universal accessibility, universal compatibility, or WCAG conformance for every future presentation. Public publication remains a separate approval.

## Browser acceptance boundary

PPTX-2 runs the production generation pipeline in Chromium and verifies the resulting OOXML package. The standard HTTP mode is still required before release because it is the mode that proves the checked-in CSP permits the same-origin runtime and that the runtime is requested only after author activation. The `--in-memory` mode is evidence for environments where navigation is administratively blocked, not a substitute for that deployment test.

Safe SVG assets still require a representative browser fixture whenever SVG behavior changes because PptxGenJS uses browser image/canvas APIs for its fallback representation. Manual PowerPoint and assistive-technology acceptance remain separate release gates.

## CI and release-candidate boundary

PPTX review and release-candidate artifacts are evidence, not publication. Both workflows use read-only repository permissions, do not modify canonical packages, do not write to `dist/`, and do not invoke Pages deployment actions. The release-candidate workflow initializes rather than fabricates human results; the initial correct disposition is `hold`. A ready release-gate record still does not publish files or add viewer links.
