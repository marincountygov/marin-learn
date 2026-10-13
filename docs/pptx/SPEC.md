# Marin Learn PowerPoint Export Specification

**Status:** PPTX-4 implemented; browser authoring, repository review, deterministic release candidate, and auditable manual acceptance gate complete

## Purpose

Marin Learn can produce an editable Microsoft PowerPoint `.pptx` derivative from one canonical `marin:Presentation`. The derivative is generated from the normalized Marin Learn presentation model, not from rendered HTML, the editor DOM, or screenshots.

PPTX remains a derivative. It is not added to the canonical Marin Learn ZIP, stored in the editor workspace, or treated as an authoring source of truth.

## Implemented scope

PPTX-1 provides the renderer and validation core:

- presentation-scoped preflight and deterministic layout planning;
- editable widescreen slide generation with PptxGenJS 4.0.0;
- Marin typography, palette, dimensions, and slide masters;
- constrained Markdown conversion for text, headings, lists, quotations, code, links, tables, and package-local images;
- real PowerPoint speaker notes;
- contextual alternative text for informative images;
- explicit PowerPoint decorative-object metadata;
- document and text language metadata;
- table first-row header metadata;
- duplicate nonvisual-object ID repair;
- structural, accessibility, brand, geometry, and metadata validation before output is returned;
- a lazy same-origin browser runtime adapter;
- automated tests against every current published Marin Learn presentation.

PPTX-2 adds the browser authoring workflow:

- a **Download PowerPoint** section in **Review and Download**;
- selection of one `marin:Presentation` when a project contains multiple decks;
- automatic presentation-scoped preflight before generation;
- separate blocking-error and nonblocking-warning states;
- **Fix** actions that return to the affected slide deck or slide;
- lazy runtime loading only after the author requests a file;
- browser Blob download, busy state, live status, concurrency protection, and focus restoration;
- a real-browser regression that verifies the generated PPTX package.

PPTX-3 adds repository and CI review automation:

- a hash-verifying Node runtime adapter that executes the same vendored PptxGenJS/JSZip bundle used by the browser;
- a command-line generator for one package, a package directory, or selected presentations;
- PPTX, manifest, production-validation, build-record, and combined-results artifacts;
- an independent standard-library Python OOXML validator that does not import the JavaScript exporter;
- LibreOffice/Poppler PDF and PNG rendering with optional montage evidence;
- a separate GitHub Actions workflow that uploads temporary review evidence without publishing files to GitHub Pages.

PPTX-4 adds release-readiness controls:

- a deterministic 14-slide source fixture covering all six layouts and all three display modes;
- a fixture builder with sorted entries, fixed ZIP metadata, and path/symlink safety checks;
- a dispatch-only release-candidate workflow for pilot or production evidence;
- a machine-readable 22-case human acceptance plan;
- checksum binding among generated decks, render evidence, the browser candidate, and manual results;
- release decisions of `ready-for-controlled-pilot`, `ready-for-production`, `hold`, or `escalate`;
- an optional deterministic evidence archive with internal SHA-256 records and explicit font-file exclusion.

The implemented feature does not provide:

- automatic publication of `.pptx` files;
- a public-viewer PowerPoint link;
- automatic continuation slides;
- round-trip import from PowerPoint;
- font embedding;
- a replacement for manual Microsoft PowerPoint and assistive-technology acceptance testing.

Those boundaries are intentional. Public publication remains a separate release decision after the manual PowerPoint and assistive-technology gates are complete.

## Public API

The entry point is `js/pptx/index.js`.

### Analyze without generating

```js
const preflight = await analyzePresentationForPptx(pkg, presentationId);
```

The result contains:

```js
{
  status: 'pass' | 'fail',
  errors: [],
  warnings: [],
  model,
  plan,
  assetIndex
}
```

Preflight never mutates the package.

### Generate a validated derivative

```js
const result = await exportPresentationToPptx(pkg, presentationId, {
  runtime,
  metadata: {
    author: 'County of Marin',
    company: 'County of Marin'
  }
});
```

A successful result contains:

```js
{
  bytes,                 // Uint8Array
  filename,              // safe .pptx filename
  mimeType,
  warnings,
  validation,
  manifest,
  postprocessAudit,
  exporterVersion
}
```

No bytes are returned when preflight or post-generation validation fails.

### Browser runtime

`loadBrowserPptxRuntime()` loads `vendor/pptxgenjs/pptxgen.bundle.js` only when generation is requested. It requires a same-origin document environment and exposes reviewed PptxGenJS and JSZip constructors to the exporter. Opening **Review and Download**, selecting a deck, and running preflight do not load PptxGenJS.

### Node and CI runtime

`loadNodePptxRuntime()` reads `vendor/pptxgenjs/manifest.json`, verifies the exact bundle byte count and SHA-256 hash, and executes the same vendored browser bundle in an isolated Node VM context. The repository therefore has no npm dependency or duplicate server-side renderer.

For safe SVG, the original vector image remains embedded. Because the Node VM has no browser canvas, the adapter supplies a deterministic transparent PNG compatibility fallback and reports `embedded-svg-with-transparent-png-compatibility` in summaries and build records. Browser generation continues to use the browser-created fallback. Node-generated SVG candidates therefore remain part of Microsoft PowerPoint release testing.

`scripts/generate_pptx.mjs` imports canonical Marin Learn ZIP packages, calls the same public exporter API, and writes only output that passes remediation and production validation. Each PPTX is accompanied by a generation manifest, production validation record, build record, and SHA-256 digest.

`scripts/validate_pptx.py` is intentionally independent of the JavaScript exporter. It inspects ZIP/XML structure, metadata, language, titles, notes, object IDs, alternative text, decorative metadata, tables, fixed typography, fonts, colors, geometry, links, active-content exclusions, and the generation manifest. `scripts/render_pptx.py` creates PDF/PNG evidence for visual review but does not replace Microsoft PowerPoint acceptance.

## Authoring workflow

`editor/assets/pptx-export.js` owns the browser interaction but not presentation semantics or OOXML generation. It:

1. reads available presentations from the current in-memory package;
2. preserves an explicit valid deck selection, otherwise prefers the active Slide Decks deck, otherwise selects the first deck;
3. calls `analyzePresentationForPptx()` without loading the PowerPoint runtime;
4. enables download for a passing preflight, including passing results with warnings;
5. disables download for blocking presentation diagnostics;
6. calls `exportPresentationToPptx()` only after an author activates **Download PowerPoint**;
7. downloads only the final validated bytes returned by the public exporter API.

Projects without a slide deck receive an explicit empty state and an **Open Slide Decks** action. PowerPoint preflight is scoped to the selected deck and does not require an unrelated unfinished quiz or learning material to pass full-package validation. Canonical ZIP export continues to use the existing full-package validation gate.

The PowerPoint section uses `aria-busy`, a polite live region, disabled controls during generation, a stable busy label, and deterministic focus behavior. Successful export returns focus to **Download PowerPoint**. Blocking diagnostics provide a **Fix** action where the affected deck or slide is known. Internal exporter-integrity failures do not offer an authoring repair action and never produce a download.

## Canonical input semantics

The exporter uses `buildPresentationModel()` from `js/core/presentation.js`.

- `ItemList.position` controls slide and content order.
- `full` uses parsed ContentUnit Markdown.
- `abstract` uses the ContentUnit abstract and requires a nonempty abstract.
- `title` uses the ContentUnit name.
- Speaker notes use the slide's full Markdown source and are converted to readable note text.
- Image references resolve only through package-local `marin-asset:` references.
- The exporter preserves source order and never silently removes content.

## Layout cardinality and behavior

These are renderer rules, not schema restrictions.

| Layout | Content blocks | PPTX behavior |
|---|---:|---|
| `title` | 0–1 | Centered title master with optional supporting text. Images are not supported. |
| `section` | 0–1 | Centered section master with optional supporting text. Images are not supported. |
| `content` | 1 or more | Ordered blocks stack vertically. One image is supported when the slide contains one content block. |
| `split` | 1–2 | Two blocks render as columns. One block uses the full body area and produces a warning. One image per column is supported. |
| `media` | exactly 1 | Text and up to two images. A missing image produces a warning and a decorative Marin fallback. |
| `quote` | exactly 1 | Featured quotation with optional ContentUnit-name attribution. Images are not supported. |

Unsupported combinations produce blocking diagnostics. The exporter does not use `slice()` or first-entry-only logic that could silently omit authored content.

## Markdown mapping

Marin Learn's existing constrained Markdown parser remains authoritative.

| Markdown | PowerPoint representation |
|---|---|
| Paragraph | Editable text box with rich text runs |
| Relative heading | Editable heading text box |
| Strong/emphasis | Bold/italic text runs |
| Inline code | Bold run with restrained background treatment |
| External HTTP, mail, and telephone link | Real PowerPoint hyperlink |
| Internal `marin-ref:` link | Styled noninteractive text plus a preflight warning |
| Ordered/unordered list | Native numbered or bulleted editable text |
| Nested list | Indented native list items |
| Block quote | Editable highlighted quotation box |
| Fenced code | Editable fixed-layout text box |
| Table | Editable PowerPoint table with first-row header metadata |
| Package-local image | Embedded image with contextual alt text or explicit decorative state |

Raw HTML is not accepted by the Marin Learn Markdown profile and is not introduced by PPTX export.

## Overflow policy

The exporter uses fixed authored font sizes. It does not enable PowerPoint automatic font shrinking.

Preflight estimates the required geometry for every title, text block, list, table, code block, and image. When content cannot fit at the defined sizes, export is blocked with an actionable diagnostic. Authors must shorten the slide, use Short summary, divide the content, or choose another layout.

The exporter does not create continuation slides because doing so would alter the authored slide sequence.

## Accessibility and document requirements

A generated file must pass all implemented structural gates before it is returned:

- widescreen 16:9 page geometry;
- nonempty title, subject, creator, company, and language metadata;
- one title placeholder per slide, with title text matching the export manifest;
- unique source slide titles;
- no duplicate nonvisual object IDs within an OOXML part;
- meaningful alternative text for informative images;
- explicit native decorative metadata and no retained decorative descriptions;
- no local path or data-URI leakage into alternative text;
- first-row table metadata;
- declared language on DrawingML text properties;
- no PowerPoint automatic text-fit instructions;
- expected notes parts;
- approved Marin fonts and colors in the generation manifest;
- WCAG contrast for planned text treatments;
- no out-of-bounds geometry or severe unintended overlap.

Automated conformance is necessary but not sufficient. Microsoft PowerPoint's Accessibility Checker, Reading Order pane, supported screen readers, font-substitution environments, and edit/save/reopen behavior remain release-level human tests.

## Brand rules

- Slide size: widescreen 16:9.
- Heading font: Jost.
- Body font: Open Sans.
- Identity: `County of Marin · Marin Learn`.
- Colors and dimensions are centralized in `js/pptx/theme.js`.
- Theme values must not be independently copied into feature code.
- Fonts are referenced but not embedded or redistributed by the exporter.

## Security and privacy

- Generation uses only the in-memory package and vendored same-origin runtime.
- No source package, slide content, image, or generated file is uploaded.
- No CDN or runtime network dependency is permitted.
- SVG assets pass Marin Learn's existing active-content and external-reference checks before PptxGenJS receives them.
- Missing, malformed, type-mismatched, or unsafe assets block export.
- Local filesystem paths and encoded data URIs are prohibited in output alternative text.

## Release-candidate and manual acceptance gate

`tests/fixtures/pptx-release/` is a deterministic test product, not a public learning set. It exercises all layouts and display modes plus lists, a table, links, informative and decorative images, SVG, Unicode, editable text, and notes. `scripts/build_pptx_release_fixture.py` packages it reproducibly.

`.github/workflows/pptx-release-candidate.yml` is manually dispatched for either `pilot` or `production`. It generates all current decks and the fixture, independently validates them, renders them, and initializes a checksum-bound manual record. It is read-only and does not publish.

The normative acceptance cases are stored in `docs/pptx/manual-acceptance-plan.json`. `scripts/pptx_release_gate.py` requires a real browser-generated fixture deck and independently validates it. The gate rejects stale hashes, changed slide counts, unknown candidate keys, missing evidence, incomplete required tests, invalid conditional dispositions, and missing environment or policy records.

A ready decision is limited to the recorded environment, scope, files, and policies. It is not a universal accessibility or compatibility statement.

## Package contract

PPTX-3 does not change:

- `schema/marin-learn-v1.schema.json`;
- `docs/PACKAGE.md`;
- the canonical learning package ZIP;
- IndexedDB workspace storage;
- public viewer routes or catalog records;
- publication behavior.

The `pptx-review.yml` workflow retains generated files only as GitHub Actions review artifacts. It does not copy them into `dist/`, add them to the canonical learning-package ZIP, or deploy them to GitHub Pages.
