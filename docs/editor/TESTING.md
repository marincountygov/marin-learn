# Marin Learn Editor - Verification and Usability Gates

**Scope:** Integration Stage A and document-first UX Stage B.  
**Authority:** Approved `marin-learn/v1` schema, Markdown profile, package rules, current MarinOS integration, and WCAG 2.2 AA.

## 1. Test policy

- Run focused tests at every phase; do not defer all testing to the final phase.
- A previous test result is evidence for the baseline, not proof that migrated code still works.
- The original v0.1.0 ZIP passed **37 Node tests** when inspected for this handoff. Those tests include editor-view tests, which are not applicable to the new UI. The isolated handoff contains only tests that directly exercise its non-UI functions.
- A test result MUST identify the command/environment and whether it actually ran; never mark manual assistive-technology coverage complete without performing it.
- User approval is required after every phase, even if all tests pass.

## 2. Test fixture contract

Primary: `examples/marinos-foundations.zip` (canonical conforming package). Expected representative resources: six ContentUnits, learning objectives, an assembled reading material, quiz/assessment items, a slide deck, and SVG asset.

Additional fixtures to create during the relevant phases:

- minimal LearningSet-only package;
- material with nested Sections and shared ContentUnits;
- same content used in more than one material and on slides;
- non-default feedback, scoring, and selection settings;
- broken references, duplicate IDs, missing asset/Markdown, invalid JSON and ZIP;
- packages with unsupported versions, invalid or nonconforming Markdown, unsafe URLs, and hostile SVG;
- real paste samples from Word, Google Docs, Outlook/Teams, and web pages, including lists, links, multi-row tables, and nested headings;
- plain-text-only clipboard sample; image pasted from clipboard;
- large-but-reasonable learning set for latency and recovery checks.

Fixtures MUST contain synthetic or public material; no County confidential/PHI data in tests or screenshots.

## 3. Core/API and package regression matrix

| ID | Case | Required behavior |
| --- | --- | --- |
| C01 | Create / open empty project | Exactly one root LearningSet, valid IDs and context |
| C02 | Import sample ZIP | Successful validation, all Markdown and asset bytes present |
| C03 | Export and reopen | Semantic graph, narrative, assets, and correct answers preserved |
| C04 | Rename metadata/title | Stable `@id` and all cross-object references preserved |
| C05 | Create/reorder/remove sections | Correct `ItemList.position`, no broken references |
| C06 | Share ContentUnit between two materials | One source; both assemblies render same canonical text |
| C07 | Copy-on-write decision | New UUID/path for selected instance; other usages unchanged |
| C08 | Remove usage only | Detaches assembly entry, leaves reusable source intact |
| C09 | Delete referenced source | Impact warning and safe reference cleanup or refusal |
| C10 | Objective hierarchy | Parent links valid and acyclic; child visibility intact |
| C11 | Optional objective associations | Content/quiz can be edited with no `teaches`/`assesses` |
| C12 | Quiz types | Single, multiple, true/false correct-answer logic preserved |
| C13 | Score policies | Weights, random/all, passing score, bands, feedback timings unchanged |
| C14 | Slide modes and ordering | full/abstract/title, all six layouts, omitted-mode default `full`, and every ordered content reference are preserved |
| C15 | Asset references | Stable `marin-asset:` links and contextual alt text preserved |
| C16 | Package import error | Failure does not replace working set or autosave |
| C17 | Browser recovery | Latest successful autosave and assets restore after reload |
| C18 | Export validation | Blocking errors prevent conforming ZIP; warnings explained |
| C19 | Schema authority | Runtime validation synchronized to canonical schema; no stale embedded copy |
| C20 | Viewer parity | Editor preview/learner viewer equivalent for the same source |

Use a semantic equality comparison that ignores incidental ZIP byte order and formatting but **never** ignores stable IDs, meaningful text, item order, score rules, or asset bytes.

## 4. Stage A isolated tests

A0: identify current test baseline and shared-code overlap. A1: nonvisual model/package/Markdown/security tests, and viewer regressions. A2: shell DOM, local assets, separation of editor from viewer, and keyboard navigation. A3: every core edit action and preview/ZIP export from basic forms. A4: end-to-end reference fixture, recovery, accessibility smoke test, and viewer URL/routing regression.

The handoff archive's `npm test` command tests only the isolated historical core. The integrated project MUST use and update its own current test runner; do not copy its test script over the viewer's existing one.

## 5. Stage B editor and paste tests

| ID | Scenario | Expected |
| --- | --- | --- |
| U01 | New author creates project | Can start with title and optional description only |
| U02 | Author writes a material | Continuous document workflow, no raw schema shown |
| U03 | Add Section / ContentUnit | Correct object type, stable ID, expected position |
| U04 | Keyboard Move up/down | Same result as pointer reorder; focus remains usable |
| U05 | Shared content edit | Warning and explicit edit-all/copy choice; no surprise changes |
| U06 | Rich-text semantic commands | Round-trip headings/lists/links/tables/code without data loss |
| U07 | Word paste | Supported paragraphs/headings/lists/tables preserved; style stripped |
| U08 | Google Docs paste | Same; embedded links safe; invalid attrs excluded |
| U09 | Outlook/Teams paste | Handles signatures/formatting and plaintext fallback safely |
| U10 | Web HTML paste | No script/event handler/style execution; safe link protocols |
| U11 | Plain text paste | Readable paragraphs; normal undo and selection |
| U12 | Paste unsupported structure | Clear warning when substantive meaning would be lost |
| U13 | Paste/drag image | Asset step, explicit alt/decorative choice, no unsafe embedded data URL |
| U14 | Paste undo | Undo restores prior state and underlying Markdown correctly |
| U15 | Copy/paste code block | Literal code stays code, not executed HTML |
| U16 | Quiz authoring | Default fields first, advanced scoring accessible without changing keys |
| U17 | Slide composition | References canonical prose; repeatable content rows preserve order; abstract notices work; editing a multi-entry split slide does not discard an entry |
| U18 | Review and Download | Package and PowerPoint downloads are clearly separated; errors actionable; autosave and publication are never confused |
| U19 | Advanced metadata | All schema-defined functionality still reachable |
| U20 | Save/export/reload after edits | No data loss and viewer renders new content correctly |
| U21 | PowerPoint browser export | Deck selection, scoped preflight, warnings/errors, busy state, focus return, and validated `.pptx` download work without uploading or mutating the package |

Provide paste fixture provenance (application/browser used) and recorded expected normalized Markdown. Do not accept syntactic validity alone; meaning and reading order matter.

### 5.1 Shared presentation-model regression

Run the non-browser suite with:

```bash
bash scripts/check.sh
```

The presentation-model tests must verify:

- ordered slide and content resolution;
- the schema default of `full` when `marin:displayMode` is omitted;
- Markdown loading only for `full` entries;
- all three display modes and all six layouts across current published fixtures;
- speaker-note parsing and semantic rendering;
- unresolved-reference diagnostics;
- preservation and contiguous renumbering when multiple content rows are reordered;
- removal, rather than serialization, of an empty content sequence for content-free title and section slides.
- export and reimport of an edited real-world multi-entry split slide without semantic loss.

Run the browser suite in an environment where local HTTP navigation is permitted:

```bash
bash scripts/check.sh --browser
```

`tests/browser_presentation_semantics.py` must confirm that an existing two-entry split slide opens with both rows, can add/remove/reorder rows without losing unsaved fields, saves and reopens with both references, previews in the saved order, cancels transactionally, validates, and renders both entries in the public viewer.

### 5.2 PowerPoint browser regression

`tests/browser_pptx_export.py` must confirm:

- the PowerPoint section, selector, and actions expose understandable accessible names;
- a project without decks provides an explicit empty state and keyboard-operable route to Slide Decks;
- presentation preflight runs without loading PptxGenJS;
- warnings remain nonblocking while errors disable download;
- an internal generation failure produces no file, offers no misleading authoring **Fix**, and leaves retry available;
- diagnostic **Fix** returns to the affected slide workflow;
- the selected deck and slide count are understandable;
- generation sets `aria-busy`, disables concurrent action, and restores focus;
- the reviewed runtime is requested once from the same origin in standard HTTP mode;
- the downloaded PPTX has the expected filename, slide and notes counts, and language metadata;
- generation does not mutate the in-memory package or local-save status;
- the feature reflows without horizontal overflow at narrow viewport sizes.

The standard mode is part of `bash scripts/check.sh --browser`. A navigation-restricted test environment may run `python3 tests/browser_pptx_export.py --in-memory` for Chromium generation evidence, but must still run the standard HTTP/CSP mode in normal CI before release.

## 6. Manual accessibility and layout checks

For each new UI workflow, check:

- keyboard-only tab sequence, Shift+Tab, Escape, Enter/Space, and keyboard alternatives to drag gestures;
- focus after route changes, dialog opening/closing, content insertion, reordering, and validation Fix actions;
- browser-neutral accessibility-tree inspection for landmarks, headings, accessible names, descriptions, roles, and states;
- editor toolbar with screen reader: current format/pressed states, selection and caret behavior, announcements without noise;
- errors announced through text and appropriate live-region semantics, not color alone;
- 200% and 400% zoom/reflow at representative viewport sizes; no full-page horizontal scrolling;
- text-spacing overrides, forced colors/high contrast, reduced motion;
- accessible image prompts, simple table headers, links and heading structure;
- disabled/hidden controls not reachable by keyboard;
- persistence status meaningful and distinguishable from publication;
- dialogs and paste notices actionable without mouse.

**Screen-reader smoke tests:** at least one Windows desktop combination used by the County, with exact browser, assistive technology, and versions recorded. Repeat rich-editor smoke checks after a library update. Automated accessibility tools supplement but do not replace human checks.

## 7. Novice usability review

Run at least three tasks with someone unfamiliar with the schema (or a structured facilitated walkthrough if users are unavailable):

1. Create a reading material and paste a short Word/Docs document containing a heading, list, link, and simple table. Preview it.
2. Reuse existing content in another material, then change only one instance without affecting the other.
3. Build a five-question quiz and short deck from existing reading material, fix a validation problem, and download a ZIP.

Success evidence: participant can identify next action and complete tasks without being told what ContentUnit, JSON-LD, `@id`, or Markdown means. Record hesitation points, confusing terms, and any data-loss or unintended reuse. Do not substitute the developer's familiarity for a novice review.

## 8. Security and privacy tests

- ZIP traversal, symlinks, duplicate/colliding paths, bombs, encrypted archives, unexpected file types, unsafe SVG, broken refs, malformed graph.
- Pasted `<script>`, DOM event handlers, style blocks, URLs using `javascript:`/unsafe schemes, base64 payloads, remote image sources.
- DOM XSS sinks: no unsafe construction from labels, pasted text, quiz content, or imported HTML.
- No external CDN or telemetry; network inspector must show intended local requests only.
- No sensitive content/answers written to diagnostic logs or remote endpoints.
- Failure paths are transactional; an invalid input does not corrupt the active local workspace.

## 9. Release gates

### Stage A accepted when

- All necessary existing editor capabilities work against the current schema and viewer core.
- Viewer regressions pass; shell looks and behaves like a current MarinOS application.
- ZIP/source round-trip and browser recovery tests pass.
- Explicit known temporary UX exceptions have agreed retirement dates/phases.
- User approves beginning Stage B.

### Stage B accepted when

- U01-U20 and applicable C01-C20 tests pass or have explicitly accepted, documented limitations.
- Real office-content paste and rich-text semantic round trip pass.
- Shared-content editing never surprises users or alters unrelated materials silently.
- A novice can complete the required authoring journey without schema knowledge.
- MarinOS shell, accessibility, security, and viewer regression evidence is attached.
- User explicitly signs off on the revised interface.

## 10. Evidence record template

For each phase/test report, use:

```text
Commit / revision:
Phase:
Environment and browser versions:
Automated test commands and results:
Manual checks performed and results:
Screenshots / accessibility-tree notes:
Semantic round-trip fixture and result:
Defects and mitigations:
Not tested / blocked:
Approval requested:
```

## 11. Shared editor dialog regression

Three automated layers cover the editor dialog migration.

### Source and architecture guard

`tests/editor-dialogs.test.mjs` fails when production editor JavaScript directly calls or monkey-patches `prompt()`, `confirm()`, or `alert()`. It also verifies that the shared component uses native `<dialog>`, a normal `<form>`, `showModal()`, field-level accessibility state, safe DOM construction, and scoped MarinOS/Pico styling.

Run it directly with:

```bash
node --test tests/editor-dialogs.test.mjs
```

It is also included in the normal non-browser check:

```bash
bash scripts/check.sh
```

### Isolated component browser test

`tests/browser_editor_dialog_component.py` executes the production dialog component in an isolated headless Chromium document. It does not navigate to a local web-server URL, so it can run in restricted environments that block loopback navigation.

It verifies:

- native `<dialog>` plus normal `<form>` semantics;
- modal opening through `showModal()`;
- accessible naming;
- primary-input focus and native required state;
- native modal focus behavior that prevents Tab from reaching background controls;
- empty and whitespace-only inline validation;
- `aria-invalid`, `aria-errormessage`, and error association;
- trimmed values and Enter submission;
- Escape and visible Cancel behavior;
- focus return;
- multi-field number validation and parsing;
- choice dialogs and state reset;
- safe initial focus for destructive confirmation;
- acknowledgement mode;
- deterministic handling of concurrent requests;
- lifecycle safety for immediately sequential requests;
- narrow-viewport containment without horizontal overflow; and
- token-driven dark-mode surface and text resolution.

Run it with:

```bash
python3 tests/browser_editor_dialog_component.py
```

### Full editor browser integration test

`tests/browser_editor_dialogs.py` exercises the component through actual Marin Learn authoring workflows. It covers:

- creation and required-title validation;
- cancellation without editor-state mutation;
- post-operation focus;
- destructive confirmation and deletion;
- acknowledgement mode;
- native modal focus behavior that prevents Tab from reaching background controls;
- narrow viewport reflow; and
- dark-mode token resolution.

Existing editor browser tests that previously intercepted JavaScript dialogs now submit the shared dialog form instead.

Run the complete browser suite in an environment that permits local HTTP navigation:

```bash
bash scripts/check.sh --browser
```

Manual release review must still inspect the browser accessibility tree and test Firefox, a Chromium-based browser, Safari where supported, light/dark mode, keyboard-only operation, 200%/400% zoom, and the persistence/export result of every migrated call site. Follow the checklist in `docs/editor/DIALOG-MIGRATION-REPORT.md`.
