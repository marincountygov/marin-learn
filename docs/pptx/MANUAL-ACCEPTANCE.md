# PowerPoint Manual Acceptance

**Status:** PPTX-4 release gate

## Purpose

Automated OOXML inspection, rendering, and browser generation are necessary but do not establish the complete Microsoft PowerPoint or assistive-technology experience. This plan defines the human checks required before a Marin Learn PowerPoint exporter release is approved for a controlled pilot or production.

Do not record an unqualified claim that every generated presentation is fully accessible or universally compatible. Record the exact tested environment, files, scope, results, and remaining limitations.

The machine-readable source of this plan is `docs/pptx/manual-acceptance-plan.json`. `scripts/pptx_release_gate.py` binds completed results to the exact generated file checksums and refuses a ready disposition when required evidence is missing, stale, failed, blocked, or incomplete.

## Release-candidate files

A release-candidate run must include:

1. Every current presentation in `packages/`.
2. The deterministic `pptx-release-conformance.zip` package built from `tests/fixtures/pptx-release/`.
3. A PowerPoint file generated from that conformance package through the real Marin Learn Authoring browser workflow.
4. Production and independent validation JSON for every Node-generated deck.
5. PDF, per-slide PNG, and montage rendering evidence.

The release fixture exercises all six layouts, all three display modes, native lists, hyperlinks, a simple table, informative and decorative images, SVG handling, Unicode, real text, and speaker notes. It is test content, not a public learning product.

## Session record

Record at least:

- tester and test date;
- operating system;
- Microsoft PowerPoint product, channel, and exact version;
- screen reader name and exact version when used;
- whether Jost and Open Sans are installed;
- content owner;
- supported PowerPoint environments;
- font-distribution policy;
- official identity or template approval status;
- whether charts, unmanaged-font devices, PDF derivatives, or printed handouts are in scope.

Keep screenshots, exported Accessibility Checker results, or other evidence beside the manual-results JSON. Evidence paths must be relative to that JSON file so the final release evidence archive can include them safely.

## Result values

Use only:

- `pass` — completed with no unresolved finding;
- `fail` — a requirement was not met;
- `blocked` — the test could not be completed;
- `not_applicable` — a conditional test is outside the declared release scope, with a specific reason;
- `escalate` — the requirement cannot be satisfied reliably without a product, library, policy, or architecture decision;
- `not_run` — not yet completed.

A failed, blocked, escalated, or required `not_run` case prevents approval. Conditional cases must be either passed or explicitly marked `not_applicable` with a reason.

## Required test cases

### MANUAL-001 — Open, render, and visual-integrity review

Open every Node- and browser-generated candidate in the County-supported desktop PowerPoint. Record repair, corruption, compatibility, or blocked-content warnings. Inspect every slide in Normal view at 100 percent and in Slide Show view. Check clipping, unexpected wrapping, tiny text, stretched images, malformed tables, missing bullets or numbers, content outside the canvas, and unintended overlap.

**Expected:** No repair prompt or material visual defect. Content matches the supplied render evidence.

### MANUAL-002 — PowerPoint Accessibility Checker

Run **Review > Check Accessibility** on every candidate. Expand every error, warning, and tip. Save the complete result. Resolve genuine findings or document a specific disposition. Save, close, reopen, and run the checker again.

**Expected:** No unresolved errors. Every warning or tip has a documented disposition. Evidence files are required.

### MANUAL-003 — Reading Order and Selection panes

Inspect every slide, prioritizing the release fixture’s media, split, quote, table, and image slides. Confirm that the unique title is first, related content remains together, informative media and tables occur in a meaningful order, decorative objects are skipped, and visual stacking is not damaged.

**Expected:** The assistive-technology order matches the intended meaning.

### MANUAL-004 — Title quality and Outline view

Use Outline view to confirm every slide has one unique, useful title and no competing duplicate title object.

**Expected:** Every slide is identifiable and navigable by title alone.

### MANUAL-005 — Informative image alternative-text quality

Inspect informative images in the release fixture and production candidates. Confirm contextual text, no redundant “image of” opening, no local path or data URI, and one announcement in the intended position.

**Expected:** Each informative image has concise, contextual alternative text announced exactly once.

### MANUAL-006 — Decorative-object behavior

Inspect decorative images, footer rules, and accents in the Alt Text and Reading Order interfaces and with a screen reader.

**Expected:** Decorative objects are marked decorative and skipped without a filename, empty graphic stop, or duplicate announcement.

### MANUAL-007 — Table structure and navigation

Use the release fixture’s table slide. Confirm that the first row is recognized as a header, the table has a simple unmerged grid, screen-reader cell navigation is coherent, header context is understandable, and the user can exit the table.

**Expected:** The table is editable, navigable, and understandable by row and column.

### MANUAL-008 — Hyperlink operation and purpose

Navigate representative links using only the keyboard. Confirm useful visible text and announced link role, then activate each destination.

**Expected:** Links are reachable, descriptive, and operational.

### MANUAL-009 — List structure and announcement

Inspect bullets, numbering, and nesting in PowerPoint and with a screen reader. Confirm they are native structures rather than typed glyphs.

**Expected:** Lists preserve editable structure, nesting, and understandable announcement.

### MANUAL-010 — Search, selection, copy, and editability

Search for accented text and representative titles. Copy body, code, list, and table text into a plain-text editor. Edit a title, paragraph, list item, table cell, and image position.

**Expected:** Content remains real, searchable, selectable, copyable, and editable rather than flattened imagery.

### MANUAL-011 — Language metadata and pronunciation

Inspect document and run proofing language. Read representative Unicode and accented text with a screen reader.

**Expected:** English (United States) is assigned unless source content specifies another language, and pronunciation is reasonable.

### MANUAL-012 — Chart labels and non-color differentiation

**Conditional:** Required only when a release candidate contains a chart.

Inspect direct labels, grayscale behavior, adjacent text alternative, chart alt text, and screen-reader behavior.

**Expected:** The takeaway is available without color and through an accurate text alternative.

### MANUAL-013 — Screen-reader end-to-end spot test

Navigate representative title, content, split, media, quote, table, list, Unicode, and decorative-object slides by slide and object using the County-supported screen reader. Record title, order, type, alt text, list and table behavior, and decorative behavior.

**Expected:** The complete meaning and sequence are understandable without sight. No required content is skipped, duplicated, or traps navigation. Evidence files are required.

### MANUAL-014 — Speaker notes

Inspect Notes view for every slide. Confirm notes are in the notes body, editable, attached to the correct slide, and excluded from the normal slide reading sequence.

**Expected:** Every authored note remains usable in County speaker-note and handout workflows.

### MANUAL-015 — Approved fonts installed

On a workstation with Jost and Open Sans installed, inspect titles, body, tables, footers, and labels. Compare with render evidence and use **Replace Fonts** or equivalent inspection.

**Expected:** Headings use Jost, body content uses Open Sans, and no unexpected font or layout fallback appears.

### MANUAL-016 — Font substitution on a clean workstation

Required for production. For a controlled pilot, it is conditional on unmanaged or missing-font devices being in scope.

Open representative decks on a controlled workstation without Jost and Open Sans. Record substitutions and inspect every slide for reflow, clipping, overlap, and hierarchy changes. Document the distribution policy.

**Expected:** The font policy is explicit and material fallback breakage is resolved or excluded from the supported distribution scope.

### MANUAL-017 — Round-trip edit, save, reopen, and recheck

Edit title, body, list, table, notes, and image position. Save as a new PPTX, close, reopen, and rerun targeted accessibility and reading-order checks.

**Expected:** PowerPoint does not repair the file; edits remain stable; required accessibility properties survive the save cycle.

### MANUAL-018 — Supported PowerPoint variants

Test desktop Windows and every additional PowerPoint variant the County intends to support. Record rendering, notes, checker, reading order, alt text, table, and font differences.

**Expected:** The support statement names exact supported environments and documents excluded or limited variants.

### MANUAL-019 — Official template, logo, and identity approval

Required for production. For a controlled pilot, it is conditional on whether final identity approval is part of the pilot scope.

Compare candidates with the authoritative County or department PowerPoint template and approved identity assets. Do not recreate or alter a logo.

**Expected:** The brand owner approves the treatment or the exporter is updated to use supplied official assets. Evidence files are required when passed.

### MANUAL-020 — Contrast, legibility, grayscale, and projection

Review on a typical monitor, in Slide Show, on a projector or conference display where practical, in grayscale, and under high-contrast settings.

**Expected:** Text and meaningful graphics remain legible and no meaning depends on color alone.

### MANUAL-021 — Printed handouts and PDF derivative

**Conditional:** Required only when handouts or PDF derivatives will be distributed.

Generate the actual derivative through the intended PowerPoint workflow and perform a separate document-accessibility review.

**Expected:** The derivative passes its own review or is not distributed.

### MANUAL-022 — Content quality, plain language, and risk review

Have program or content owners review actual production decks for accuracy, plain language, privacy, legal or policy implications, records requirements, and fidelity to source meaning.

**Expected:** The responsible content owner approves the substantive content and any remaining limitation is documented.

## Acceptance dispositions

The release gate emits one of these dispositions:

- `ready-for-controlled-pilot` — automated evidence passes and every pilot-required manual case passes or has an explicit, valid conditional disposition;
- `ready-for-production` — automated evidence passes and every production-required manual case passes, including font policy and official identity approval;
- `hold` — one or more required checks are incomplete, failed, blocked, stale, or missing;
- `escalate` — a requirement requires a product, library, architecture, or policy decision.

Public PPTX publication remains a separate decision. A ready release-gate result does not by itself add files to `dist/`, the public viewer, the catalog, or the canonical Marin Learn ZIP.
