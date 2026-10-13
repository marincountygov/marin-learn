# Marin Learn v0.1.0 - Functional Migration Inventory

**Purpose:** Give OpenCode an accurate starting map of the existing editor, without treating its UX or markup as a template.

**Legacy source:** `marin-learn-v0.1.0.zip` (the earlier standalone editor release).  
**Independent check:** Original unmodified archive's `npm test` passed 37/37 tests in the handoff environment.  
**Schema consistency:** Its bundled JSON Schema, Markdown specification, package specification, and example ZIP have identical SHA-256 hashes to the available authoritative companion files used for this handoff.  
**Important:** Passing historical tests does not establish compatibility with the current viewer or compliance of the old UI.

## 1. Legacy functional modules

| File | Relevant exports/behavior | Migration disposition |
| --- | --- | --- |
| `js/core/constants.js` | Model type constants, controlled vocabularies, JSON-LD context | Compare with current viewer and canonical schema; one source of truth |
| `js/core/utils.js` | UUID URNs, safe names, comparison, escaping, helpers | Reuse or adapt helpers; `downloadBlob()` is browser-specific |
| `js/core/model.js` | Project/root creation; graph lookups; objects; objectives; materials/sections; questions/answers; grade scales; slides/assets; sequence/usage/reference handling | Primary **behavior reference**; avoid second graph model in viewer |
| `js/core/markdown.js` | Normalization, parser, inline syntax, HTML render, serializer, validation, ref extraction | Primary **semantic reference**; verify full `MARKDOWN.md` conformance and safe DOM integration |
| `js/core/assets.js` | Image MIME sniffing, file safety, SVG validation | Reuse after checking current viewer asset policy |
| `js/core/validate.js` | Schema, graph, assets, Markdown, and package diagnostics | Reuse rules, adapt diagnostics to actionable UI |
| `js/core/schema-validator.js` | Runtime JSON Schema checking | Retain only if compatible with current viewer; assess standards coverage |
| `js/core/schema-data.js` | Generated/embedded v1 schema object | Historical snapshot only; DO NOT create a competing schema authority |
| `js/core/zip.js` | Browser ZIP generation/import, safety limits and errors | Reuse or adapt; security-sensitive, regression required |
| `js/core/package.js` | ZIP import/export, canonical serialize, package entries | Primary **format contract reference**; reconcile with publisher |
| `js/core/renderers.js` | Reading/slide HTML, quiz selection/scoring/results | **Split business rules from legacy HTML/CSS**; viewer renderers take precedence |
| `js/storage.js` | IndexedDB recovery for one active workspace | Browser-only candidate; review namespacing, recovery and failure handling |

Old `js/core/renderers.js` emits class names coupled to legacy styling and includes both semantic operations and HTML strings. Its quiz scoring and selection semantics may be useful, but its markup must not replace accepted viewer components.

## 2. UX files NOT to migrate as interface foundations

| File | Why not migrate wholesale |
| --- | --- |
| `index.html` | Legacy editor shell/header/footer and dialogs; viewer shell is now authoritative |
| `css/app.css` | Legacy visual system; would compete with Marin App Shell / marin-ui |
| `js/ui/views.js` | Schema-category sidebar and large raw forms inconsistent with document-first UX |
| `js/ui/rich-editor.js` | Custom `contenteditable` + `document.execCommand`, old toolbar/paste UX |
| `js/app.js` | Monolithic controller (about 1,249 lines) mixing event wiring, object mutations, and UX assumptions |
| `tests/views.test.mjs` | Tests legacy routes, sidebar, and start screens intentionally being replaced |

Do not import these into the current project's production viewer/editor just to recover a feature. Inspect the legacy code for behavior, then implement that behavior through current adapters.

## 3. Historical tests in the extracted core

The handoff carries five UI-independent test modules:

- `tests/conformance.test.mjs`
- `tests/markdown.test.mjs`
- `tests/package.test.mjs`
- `tests/renderers.test.mjs`
- `tests/validation.test.mjs`

The sixth (`tests/views.test.mjs`) stays with the unchanged full legacy ZIP and is deliberately omitted. Those two/three historical view checks should not drive the new UI.

Tests import relative source files from `js/core/` and use `examples/example-package.js`. Run them as baseline diagnostics before migration. Once modules are merged into the current viewer, add tests to the viewer's own test infrastructure rather than replacing its scripts.

## 4. Integration decision ledger - complete during A0

For each functional area, OpenCode must record the **current viewer implementation**, the **legacy implementation**, differences, authoritative specification, and disposition (`existing`, `reuse`, `adapt`, `rewrite`, `retire`). At minimum:

1. Graph model, ID generation, and referential integrity.
2. Markdown parser, sanitizer, serializer and heading behavior.
3. Asset and SVG validation.
4. ZIP import/export and repair behavior.
5. Assessment selection, score rules and answer feedback.
6. Reading/slide renderer semantics and preview parity.
7. IndexedDB state/recovery with nested `/editor/` routes.
8. Authoring mutations, structured collection sequencing, copy-on-write.
9. Validation diagnostics, source inspection and download UX.
10. Accessibility/security differences.

No migrations until the user approves that ledger.

## 5. Compatibility and data traps

- Imported ZIP files are not safe UI code. Preserve safe decoding/validation and transactional activation.
- Stable `@id` must survive titles and filename changes; meaningful serialized content must not be lost.
- Content reference removal versus actual deletion are different operations.
- Duplicating a shared ContentUnit requires a new UUID, new file and one assembly reference update.
- A ContentUnit's `abstract` is optional. Slide `abstract` mode still requires one where referenced.
- Optional `teaches`/`assesses` links are not blockers by themselves.
- Quiz correctness comes from `marin:correctResponse`, not a second boolean on options.
- `marin:weight` belongs to an assessment sequence membership, not the reusable question source.
- Schema-data JS mirrors must not silently drift from the canonical JSON Schema.
- Old `document.execCommand()` behavior is not an accessibility or paste-quality baseline.
- The viewer should never fetch editor ZIP, storage, or WYSIWYG scripts to read learning content.
- An editor export is not public publishing and must not regenerate `catalog.json` by itself.

## 6. Review outcome expected

OpenCode's A0 report should end with a concise file-by-file integration plan and any contract conflicts. It must then stop for approval. The provided handoff is not authorization to import code, install a new editor library, alter MarinOS siblings, or begin Stage B.
