# PowerPoint Review and Release Automation

**Status:** PPTX-4 implemented

## Purpose

Marin Learn provides two separate repository workflows:

- `.github/workflows/pptx-review.yml` continuously generates temporary review evidence for relevant pull requests, pushes to `main`, and manual dispatches.
- `.github/workflows/pptx-release-candidate.yml` is a manually dispatched, checksum-bound release-candidate workflow used before human Microsoft PowerPoint and assistive-technology acceptance.

Neither workflow publishes PowerPoint files. Generated `.pptx` files remain temporary evidence until the release gate is completed and public publication is separately approved.

## Node runtime

`js/pptx/runtime-node.js` executes the same `vendor/pptxgenjs/pptxgen.bundle.js` bytes used by browser export. Before execution it verifies:

- PptxGenJS version 4.0.0;
- JSZip version 3.10.1;
- the bundle byte count;
- the bundle SHA-256 recorded in `vendor/pptxgenjs/manifest.json`.

The adapter uses an isolated Node VM context. There is no `package.json`, npm installation, alternate PptxGenJS build, CDN request, or runtime package download.

PptxGenJS normally asks browser canvas APIs to create a PNG compatibility fallback when an SVG is embedded. The Node adapter retains the original vector SVG and supplies a deterministic transparent PNG compatibility fallback. Every Node summary and build record reports:

```text
svgFallback: embedded-svg-with-transparent-png-compatibility
```

This behavior must remain covered by release-fixture generation and manual PowerPoint testing. It does not alter browser generation, where PptxGenJS can use the browser-created raster fallback.

## Generator

```bash
node scripts/generate_pptx.mjs packages --out build/pptx-review
```

Accepted inputs are one or more canonical `.zip` packages or directories containing package ZIPs. Relevant options include:

```text
--presentation <ID, identifier, or exact name>   repeatable selection
--summary <file>                                 combined JSON result
--fail-on-warning                                optional strict warning policy
--no-clean                                       retain prior output
```

For each presentation the generator writes:

```text
<learning-set>/<presentation>.pptx
<learning-set>/<presentation>.manifest.json
<learning-set>/<presentation>.validation.json
<learning-set>/<presentation>.build.json
```

The build record includes source and output SHA-256 values, exporter/runtime versions, the Node SVG fallback policy, warnings, production validation evidence, and OOXML-remediation counts. `results.json` summarizes the complete run. A presentation is not written until the production exporter completes preflight, generation, remediation, and structural validation. Recursive cleanup refuses filesystem roots, the repository root, the current working directory, and any directory that contains an input package.

## Independent validation

```bash
python3 scripts/validate_pptx.py build/pptx-review \
  --require-manifest \
  --write-sidecars \
  --out build/pptx-review/independent-validation.json
```

The validator uses only Python's standard library and does not import or call the JavaScript validator. It checks ZIP safety, XML structure, metadata, language, slide titles, object IDs, alternative text, decorative state, tables, notes, approved fonts and colors, geometry, contrast evidence, active-content exclusions, relationships, and the generation manifest.

Known-invalid fixtures prove that the independent validator rejects required defects rather than accepting every generated file.

## Render evidence

```bash
python3 scripts/render_pptx.py build/pptx-review --out build/pptx-rendered
```

The renderer requires LibreOffice and Poppler; ImageMagick is used when available for montages. It creates one PDF per deck, one PNG per slide, optional montages, render logs, and `render-results.json` with slide-count comparisons.

Rendering catches corruption and major visual regressions, but LibreOffice is not the authority for Microsoft PowerPoint accessibility, reading order, font substitution, or round-trip editing.

## Continuous review workflow

`.github/workflows/pptx-review.yml` runs for relevant pull requests, pushes to `main`, and manual dispatches. It:

1. runs the normal repository checks;
2. generates all current package presentations;
3. runs the independent OOXML validator;
4. renders PDF, PNG, and montage evidence;
5. uploads both build directories for 14 days.

The workflow has only `contents: read` permission. It does not use Pages permissions, Pages upload/deploy actions, `scripts/publish.py`, or `dist/`.

## Release-candidate workflow

`.github/workflows/pptx-release-candidate.yml` is `workflow_dispatch` only. The person starting it selects either `pilot` or `production`. It:

1. runs the complete repository checks;
2. builds the deterministic package under `tests/fixtures/pptx-release/`;
3. generates every current package presentation plus the 14-slide release fixture;
4. runs independent OOXML validation;
5. renders all candidates;
6. initializes a checksum-bound `manual-results.json` for the selected release target;
7. uploads the fixture, generated files, render evidence, and manual template for 30 days.

The workflow intentionally does not evaluate a release as ready because the human results do not yet exist. After downloading the candidate artifact, testers generate the required real-browser fixture deck, complete the 22 manual cases, and run `scripts/pptx_release_gate.py evaluate` locally or in another controlled review process.

The release-candidate workflow also has only `contents: read` permission and no publication step.

## Release gate

The release gate binds human results to exact candidate hashes and slide counts:

```bash
python3 scripts/pptx_release_gate.py init \
  --review build/pptx-review \
  --render build/pptx-rendered \
  --target pilot \
  --out build/pptx-release/manual-results.json

python3 scripts/pptx_release_gate.py evaluate \
  --review build/pptx-review \
  --render build/pptx-rendered \
  --manual build/pptx-release/manual-results.json \
  --out build/pptx-release/release-decision.json \
  --report build/pptx-release/RELEASE-DECISION.md \
  --package build/pptx-release/marin-learn-pptx-release-evidence.zip
```

The gate rejects stale checksums, changed slide counts, unknown file keys, a browser export generated from the wrong source package, missing evidence files, incomplete required tests, invalid conditional dispositions, and unsupported ready-state metadata. It emits one of:

- `ready-for-controlled-pilot`;
- `ready-for-production`;
- `hold`;
- `escalate`.

A ready disposition records only the tested scope. It is not a universal accessibility or compatibility claim.

## Publication boundary

A separate approved phase is required to:

- copy PPTX files into `dist/learning/...`;
- add public viewer download links;
- add catalog derivative metadata;
- define public retention, versioning, and support rules.

PPTX-4 does none of those things.
