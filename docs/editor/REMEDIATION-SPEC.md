# Marin Learn Editor — Functional Remediation SPEC

**Status:** Implementation specification  
**Target:** Existing `editor/` application after the stabilization patch  
**Audience:** OpenCode Desktop agent and project reviewer  
**Primary users:** Occasional, non-technical County staff  
**Canonical content contracts:** Existing Marin Learn v1 schema, Markdown specification, and package specification

## 1. Purpose

Complete the Marin Learn editor without restarting or redesigning the learner-facing viewer.

The current application already contains the intended top-level editor navigation and a functional shared core. The stabilization patch repairs package loading, material/content editing, validation, image import, and ZIP export. This specification defines the remaining work required for full Marin Learn v1 authoring.

The editor must present a document-first experience. Authors should feel that they are creating a learning project, reading material, quiz, and slide deck—not manipulating JSON-LD objects or graph references.

## 2. Mandatory baseline

Before implementing this specification:

1. Apply `marin-learn-editor-stabilization.patch`.
2. Run `bash scripts/check.sh`.
3. Run `python3 tests/browser_editor_smoke.py` in an environment where Chromium may access localhost.
4. Confirm that all reference packages still import and export.
5. Stop for review if any baseline check fails.

Do not recreate the repaired pathways with a parallel implementation.

## 3. Confirmed product decisions

| Area | Decision |
| --- | --- |
| Primary user | Occasional, non-technical author |
| Advanced user support | Advanced controls remain available through progressive disclosure |
| Primary authoring model | Document-first |
| Content reuse | Available, but not central to the first-use workflow |
| Common authoring source | Equal emphasis on writing from scratch and copying/pasting existing material |
| Technical metadata | Hidden by default; retained under Advanced settings |
| Integration sequence | Functional integration first, then UX refinement |
| Existing local workspaces | No migration requirement; there is no production use yet |
| Reading Material editing | Inline expansion within the continuous document view |
| Rich text | Final constrained WYSIWYG foundation; do not use `document.execCommand()` |
| Quiz editing | Full Marin Learn v1 behavior; no title-only placeholder |
| Slide editing | Full Marin Learn v1 behavior; no title-only placeholder |
| Objectives | Contextual editing; not a permanent top-level tab |
| Content Library | Secondary reuse/browse interface; not the primary authoring path |

## 4. Non-negotiable constraints

- Do not change `schema/marin-learn-v1.schema.json` merely to simplify the UI.
- Do not introduce a second canonical content format.
- Keep one Markdown file per ContentUnit.
- Preserve stable `@id` values and internal references.
- Preserve unknown supported graph properties that the simplified UI does not expose.
- Use existing model functions rather than manually pushing objects into `@graph`.
- Reuse the viewer/shared rendering and assessment logic; do not fork it.
- Do not modify sibling MarinOS repositories.
- Do not make the editor depend on a production backend.
- Do not expose raw UUIDs, JSON-LD types, or filenames in the normal workflow.
- Do not implement incomplete create buttons that produce unusable quiz or slide objects.

## 5. User-facing terminology

Use these labels consistently:

| Schema/internal term | User-facing label |
| --- | --- |
| LearningSet | Learning Project |
| LearningMaterial | Reading Material |
| ContentUnit | Content block, or simply Content when context is clear |
| Content library | Content Library |
| DefinedTerm objective | Learning Objective |
| Assessment | Quiz |
| AssessmentItem | Question |
| Presentation | Slide Deck |
| Slide | Slide |
| MediaObject/ImageObject | Image or File, as applicable |
| Export package | Download Learning Package |

Technical terms may appear only in Advanced/source/diagnostic views.

## 6. Architecture

### 6.1 Shared core

Continue using the existing modules under `js/core/` for:

- object creation and identity;
- sequence manipulation;
- relationship management;
- Markdown parsing, serialization, and validation;
- package import/export;
- schema and semantic validation;
- assessment selection/scoring;
- shared rendering.

Do not move business rules into view templates.

### 6.2 Editor modules

Refactor the editor controller incrementally toward these responsibilities:

```text
editor/assets/
├── app.js                     # startup, routing, shared state coordination
├── rich-editor.js             # constrained semantic Markdown editor
├── materials.js               # document-first materials and reuse
├── quizzes.js                 # full quiz authoring
├── slides.js                  # full slide-deck authoring
├── objectives.js              # contextual objective editor
├── assets.js                  # asset management and insertion
├── validation.js              # diagnostics and fix navigation
└── app.css
```

This is a responsibility boundary, not a requirement to create every file immediately. Avoid one growing controller that owns every workflow.

### 6.3 State changes

Every mutation must:

1. use a tested model/helper function where one exists;
2. update the canonical package in memory;
3. call `touchPackage()` where required;
4. save to IndexedDB;
5. update only the affected editor view;
6. remain serializable through `exportLearningPackage()`;
7. survive export/import semantic round-trip testing.

## 7. Reading Materials: complete document-first authoring

### 7.1 Continuous document interface

A selected Reading Material must appear as one editable document assembled from Sections and ContentUnits in canonical sequence order.

Authors must be able to:

- edit material title, summary, type, duration, and advanced metadata;
- add content at the end or at a selected insertion point;
- edit a ContentUnit inline;
- add and rename Sections;
- nest Sections up to the schema-supported depth;
- reorder Sections and ContentUnits with keyboard-accessible controls;
- move content between Sections;
- duplicate content;
- remove content from a Material without necessarily deleting the canonical ContentUnit;
- preview the assembled Reading Material with the same renderer as the viewer.

Drag-and-drop may be added, but Move up, Move down, Move into section, and Move out of section controls are mandatory.

### 7.2 Inline ContentUnit editor

The stabilized `rich-editor.js` is the foundation. Complete it rather than replacing it casually.

The editor must support the full approved Markdown profile:

- paragraphs;
- relative headings H2-H6;
- bold and emphasis;
- safe links and Marin internal links;
- bulleted and numbered lists, including supported nesting;
- block quotations;
- inline code and fenced code blocks;
- simple accessible tables;
- images using stable `marin-asset:` references.

Raw HTML, arbitrary styles, arbitrary colors, font controls, and unsafe URLs remain prohibited.

### 7.3 Paste behavior

Pasting from Microsoft Word, Outlook, Teams, Google Docs, and ordinary web pages is a first-class workflow.

Paste normalization must:

- retain paragraphs, headings, lists, emphasis, links, simple tables, and code where meaning is clear;
- discard fonts, colors, spacing styles, classes, IDs, scripts, event handlers, and layout markup;
- convert supported content to canonical Marin Learn Markdown;
- show a clear warning before discarding materially unsupported structures;
- never place untrusted pasted HTML directly into the canonical model;
- preserve undo behavior for the paste operation.

Add automated fixture tests for representative Word/Google Docs/web clipboard HTML. Do not claim broad paste support based on plain-text tests alone.

### 7.4 Content reuse

When adding content, the default action is **Create new content**. A secondary action is **Reuse existing content**.

The reuse picker must support:

- search by title, summary, type, and keyword;
- preview before selection;
- indication of where an item is already used;
- reuse by reference without copying Markdown;
- creation of a deliberate copy when the author chooses **Duplicate as new content**.

When editing content used by more than one Material or Slide Deck, show:

> This content is used in multiple places. Changes will appear everywhere it is used.

Provide **Edit shared content** and **Duplicate before editing** choices.

### 7.5 Deletion

Distinguish:

- Remove from this Reading Material;
- Delete content from the Learning Project.

Before global deletion, show all usages returned by `usagesOf()` and require explicit confirmation. Never silently remove references from unrelated resources.

## 8. Learning Objectives

Learning Objectives remain contextual rather than a permanent tab.

Provide objective management from:

- Project Overview;
- Reading Material settings;
- ContentUnit settings;
- Quiz Question settings.

Authors must be able to:

- create, edit, reorder, and delete objectives;
- create parent/child relationships;
- see which content teaches an objective;
- see which questions assess an objective;
- select objectives using names, not IDs;
- receive warnings for objectives not taught or not assessed.

Advanced identity and external alignment properties remain under progressive disclosure.

## 9. Full v1 Quiz authoring

The disabled stabilization-phase **Create quiz** control may be enabled only when the following workflow is complete.

### 9.1 Quiz management

Authors must be able to:

- create, rename, duplicate, and delete quizzes;
- edit summary and source Reading Material relationships;
- reorder questions;
- reuse an existing question;
- duplicate a question as a new independent question;
- preview the quiz using the learner-facing quiz renderer.

### 9.2 Question types

Support all v1 interaction types:

- Single answer;
- Multiple answers;
- True or false.

Question forms must manage:

- prompt using the constrained Markdown editor;
- answer options;
- correct response set;
- option-specific feedback;
- hint;
- explanation;
- option shuffling;
- associated Learning Objectives;
- source ContentUnits;
- assessment-specific weight.

Correctness must remain stored only in `marin:correctResponse`.

### 9.3 Quiz policies

Provide understandable controls for:

- Show every question or select a random number;
- Shuffle question order;
- Passing percentage, optional;
- Feedback timing: after each question, after the quiz, or no detailed feedback;
- Show correct answers;
- Show answer feedback;
- Show explanation;
- Optional Grade Scale.

Use plain-language help. Keep exact schema names in Advanced/source views only.

### 9.4 Validation

Prevent or clearly flag:

- no questions;
- insufficient answer options;
- no correct answer;
- every multiple-select option marked correct;
- invalid random count;
- unresolved objective/source references;
- invalid true/false option identifiers;
- duplicate or missing sequence positions.

## 10. Full v1 Slide Deck authoring

The disabled stabilization-phase **Create slide deck** control may be enabled only when the following workflow is complete.

### 10.1 Deck management

Authors must be able to:

- create, rename, duplicate, and delete decks;
- associate a deck with a Reading Material;
- add, duplicate, reorder, and delete slides;
- preview using the learner-facing slide renderer.

### 10.2 Slides

Support all approved layouts:

- Title;
- Section;
- Content;
- Split;
- Media;
- Quote.

For each referenced ContentUnit support:

- Full content;
- Summary (`abstract`);
- Title only.

Authors must select content by human-readable title. The editor stores stable references.

Speaker notes use the full Marin Learn Markdown profile.

### 10.3 Presentation guidance

- Do not copy canonical content into slide-only text fields.
- When Summary mode is selected and the ContentUnit lacks an abstract, direct the author to add one.
- Show overflow warnings using the actual shared slide renderer.
- Do not auto-truncate or invent summaries.
- Preserve slide-specific title, layout, and speaker notes as legitimate presentation metadata.

## 11. Images and Files

Complete the current image import pathway.

Authors must be able to:

- add supported images;
- preview images;
- edit title, caption, credit, license, and other exposed metadata;
- insert an image into the active rich-text editor;
- enter contextual alternative text or explicitly mark the usage decorative;
- see where an image is used;
- delete unused images;
- receive dependency warnings before deleting used images.

Alternative text belongs to each Markdown usage, not globally to the asset.

Unsafe SVG and mismatched file types must remain blocked.

## 12. Advanced settings and source transparency

Hide technical metadata by default, but preserve access through **Advanced settings** and read-only source views.

Advanced views may expose:

- identifier slug;
- stable object ID;
- status/version/dates;
- content path;
- graph/source references;
- generated Markdown;
- generated JSON for the selected object.

Raw source editing remains out of scope unless separately approved.

## 13. Validation and guided repair

Validation must run continuously where practical and on demand before export.

The Review and Download view must:

- group errors and warnings;
- use plain-language messages;
- identify the affected material/question/slide/image;
- offer **Fix** actions that navigate to and focus the relevant field;
- keep warnings non-blocking unless the canonical specification says otherwise;
- block each export only for errors in its applicable validation scope;
- keep canonical ZIP validation separate from selected-presentation PowerPoint preflight;
- provide nonblocking PowerPoint warnings and route known slide diagnostics back to Slide Decks;
- never discard unknown fields to make validation pass.

## 14. Accessibility

WCAG 2.2 AA is required for the editor.

Mandatory checks include:

- correct tab semantics and keyboard navigation;
- logical focus after navigation, adding, saving, canceling, and deleting;
- accessible toolbar names and states;
- keyboard operation of all reordering features;
- screen-reader-readable forms and validation errors;
- browser-neutral accessibility-tree inspection;
- 200% and 400% zoom/reflow;
- forced colors and reduced motion;
- touch target sizing;
- table editing semantics;
- no color-only correctness or status indicators.

A custom rich-text editor requires explicit keyboard and screen-reader testing; do not assume `contenteditable` is sufficient.

## 15. Security and data integrity

- Treat ZIP, JSON, Markdown, clipboard HTML, SVG, links, and filenames as untrusted.
- Do not use unchecked `innerHTML` with imported content outside the shared sanitized renderer.
- Do not dereference remote JSON-LD contexts.
- Do not permit scripts, handlers, iframes, embedded active documents, or unsafe URL schemes.
- Import must remain transactional.
- A failed edit or validation must not corrupt the saved workspace.
- Canonical ZIP export must use the byte payload returned by `exportLearningPackage()`.
- PowerPoint export must use only the final bytes returned by `exportPresentationToPptx()` after mandatory remediation and validation.
- Generated derivatives must not be added to the canonical package or browser workspace.

## 16. Required tests

### 16.1 Unit/integration

Maintain all existing tests and add coverage for:

- material/section/content create, update, reorder, remove, reuse, and duplicate;
- objective hierarchy and mappings;
- all quiz types and policies;
- reusable questions and assessment-specific weights;
- all slide layouts and display modes;
- contextual image alternative text;
- dependency-aware deletion;
- source properties not exposed by the UI surviving edits;
- export/import semantic round trips.

### 16.2 Rich-text and paste fixtures

Add deterministic tests for:

- Markdown → editor DOM → Markdown semantic round trip;
- Word-style HTML paste;
- Google Docs-style HTML paste;
- web-page HTML paste;
- lists, nested lists, tables, links, code, headings, and images;
- removal of scripts, styles, classes, event handlers, unsafe URLs, and unsupported HTML.

### 16.3 Browser workflows

Browser tests must cover:

1. create a project;
2. create a Reading Material and nested Section;
3. paste and edit content;
4. reuse shared content;
5. create objectives;
6. create each question type and configure quiz policies;
7. create all slide layout types;
8. add and insert an image with alt text;
9. validate;
10. export;
11. reimport and confirm semantic preservation;
12. keyboard-only completion of core workflows.

Use all three current reference packages as regression fixtures.

## 17. Implementation phases and mandatory stops

### Phase R0 — Apply and verify stabilization patch

- Apply the supplied patch.
- Run all non-browser checks.
- Run the editor browser smoke test.
- Review the Materials workflow manually.
- Stop for approval.

### Phase R1 — Detailed UX and state design

- Map all remaining schema objects to user tasks.
- Present screen/flow descriptions for Materials, Objectives, Quizzes, Slides, Assets, validation, reuse, and deletion.
- Identify module boundaries and shared-core calls.
- Do not implement feature code.
- Stop for approval.

### Phase R2 — Complete Reading Materials and objectives

- Sections, ordering, reuse, duplication, deletion, objectives, advanced settings, preview, and paste fixtures.
- Stop for approval.

### Phase R3 — Full Quiz authoring

- Complete all requirements in Section 9.
- Enable Create quiz only after acceptance tests pass.
- Stop for approval.

### Phase R4 — Full Slide Deck authoring

- Complete all requirements in Section 10.
- Enable Create slide deck only after acceptance tests pass.
- Stop for approval.

### Phase R5 — Assets and rich-text completion

- Asset metadata, insertion, contextual alt text, dependency handling, and remaining Markdown-profile behaviors.
- Stop for approval.

### Phase R6 — Validation, accessibility, and release hardening

- Guided repair, full regression suite, accessibility review, source preservation, and release documentation.
- Stop for final approval.

The agent must not proceed to the next phase without explicit authorization.

## 18. Phase completion report

At each stop, report:

1. Files changed.
2. Behavior implemented.
3. Tests run and exact results.
4. Browser/manual checks completed.
5. Accessibility checks completed.
6. Known limitations and deferred items.
7. Screenshots for changed user-facing screens.
8. Any deviation from this specification.

Do not claim a test or conformance result that was not actually performed.

## 19. Final acceptance criteria

The remediation is complete when a non-technical County author can:

- create or open a Learning Project;
- write or paste a continuous Reading Material;
- organize it into Sections without understanding ContentUnits;
- reuse or duplicate content with clear consequences;
- create hierarchical Learning Objectives;
- build complete v1 quizzes;
- build complete v1 slide decks from canonical content;
- add accessible images;
- preview all learner experiences;
- understand and fix validation issues;
- download a valid package;
- reopen the package without supported semantic loss;
- complete every core workflow with a keyboard.

The learner-facing viewer and canonical Marin Learn contracts must continue to work unchanged.
