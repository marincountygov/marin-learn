# PowerPoint Release Procedure

**Status:** PPTX-4 implemented

## Boundary

PPTX-4 creates an auditable release-candidate and human acceptance process. It does not publish PowerPoint files, modify `scripts/publish.py`, add public download links, alter the Marin Learn schema, or place a PPTX inside the canonical learning-package ZIP.

## 1. Build the deterministic release fixture

```bash
python3 scripts/build_pptx_release_fixture.py \
  --out build/pptx-fixtures/pptx-release-conformance.zip \
  --summary build/pptx-fixtures/result.json
```

The source under `tests/fixtures/pptx-release/` is committed as ordinary JSON, Markdown, and SVG. The ZIP builder sorts entries, uses fixed timestamps and permissions, rejects symlinks and unexpected paths, and produces reproducible bytes.

## 2. Generate automated release evidence

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

The automated evidence must include the release fixture and every current package presentation. File hashes, slide counts, production validation, independent validation, and rendering records must agree.

The manually dispatched `pptx-release-candidate.yml` workflow performs these steps and uploads a temporary candidate artifact. It has read-only repository permission and no deployment step.

## 3. Create a checksum-bound manual record

For a controlled pilot:

```bash
python3 scripts/pptx_release_gate.py init \
  --review build/pptx-review \
  --render build/pptx-rendered \
  --target pilot \
  --out build/pptx-release/manual-results.json
```

For production, use `--target production`.

The generated JSON records every Node-generated deck, checksum, slide count, and all 22 manual tests. Do not replace the recorded checksums manually. Regenerate the record when any candidate deck changes.

## 4. Generate the browser candidate

1. Run Marin Learn Authoring through its normal HTTP deployment or local server.
2. Import `build/pptx-fixtures/pptx-release-conformance.zip`.
3. Open **Review and Download**.
4. Select **Marin Learn PPTX Release Conformance**.
5. Download the PowerPoint file.
6. Place it beside `manual-results.json` or in a subdirectory below it.
7. Record the relative file path, SHA-256, browser and version, download time, and result in `browserExport`.

The release gate independently validates the browser-generated file against the release fixture manifest. A copied Node file is not acceptable real-world evidence even though automated tests may use a copy as a test fixture.

## 5. Complete human testing

Follow `docs/pptx/MANUAL-ACCEPTANCE.md`. Record the exact environment and a result for every case. Conditional cases outside scope must use `not_applicable` and include a specific reason. Required evidence files must remain below the manual-results directory.

A passing screen-reader case requires the screen-reader name and version. Font, supported-environment, identity, and content-owner decisions must be recorded in their dedicated fields.

## 6. Evaluate and package the decision

```bash
python3 scripts/pptx_release_gate.py evaluate \
  --review build/pptx-review \
  --render build/pptx-rendered \
  --manual build/pptx-release/manual-results.json \
  --out build/pptx-release/release-decision.json \
  --report build/pptx-release/RELEASE-DECISION.md \
  --package build/pptx-release/marin-learn-pptx-release-evidence.zip
```

The command exits successfully only for `ready-for-controlled-pilot` or `ready-for-production`. It exits nonzero for `hold` or `escalate` while still writing the decision files and optional evidence archive.

The evidence ZIP contains:

- generated PPTX files and sidecars;
- independent validation;
- render evidence;
- completed manual results;
- referenced manual evidence files;
- browser-generated candidate;
- decision JSON and Markdown;
- the acceptance plan and release procedure;
- `SHA256SUMS`.

Font files are explicitly prohibited from the evidence archive.

## Node SVG compatibility fallback

The reviewed PptxGenJS browser bundle normally uses browser canvas APIs to create a PNG compatibility fallback for SVG. The Node adapter does not introduce a canvas or image-processing dependency. It supplies a deterministic one-pixel transparent PNG fallback while retaining the original SVG vector image in the PPTX.

Current supported PowerPoint must therefore be tested with Node-generated SVG slides. Browser-generated files retain the browser-created raster fallback. Do not approve an environment that cannot display the embedded SVG correctly. Public Node-based publication would require a separate decision if broader legacy-client fallback is required.

## Rerun triggers

Repeat the complete release gate when any of these change:

- PptxGenJS or JSZip version or bundle bytes;
- OOXML postprocessing;
- Node or browser runtime adapter;
- slide layout geometry or typography;
- Markdown, table, image, hyperlink, or notes rendering;
- brand colors, fonts, identity, or template assets;
- supported PowerPoint or assistive-technology environments;
- font-distribution policy;
- public derivative or publication policy.
