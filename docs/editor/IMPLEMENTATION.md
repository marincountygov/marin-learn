# Marin Learn Editor - Incremental OpenCode Implementation Plan

**Status:** Required implementation process.  
**Start condition:** Viewer Phase 8 accepted. No editor integration may begin while the viewer architecture or MarinOS baseline remains unresolved.  
**Ownership:** OpenCode operates only within `marin-learn/`; sibling MarinOS repositories are read-only.

## 1. Non-negotiable workflow

- The user authorizes **one phase at a time**. The agent MUST stop after reporting and showing evidence for that phase.
- Stage A and Stage B cannot be combined. Stage B starts only after Stage A's functional baseline is accepted.
- Work from the current `marin-learn` viewer repository, not from the old v0.1.0 editor UI. The old archive and handoff package are migration references.
- Do not silently change the canonical `marin-learn/v1` schema, Markdown profile, package contract, viewer routing, or public catalog.
- Before changing shared core functions, identify consumer call sites and run viewer regression tests.
- Use the installed App Shell/`marin-ui` patterns, never a hand-built imitation. Prefer no runtime dependencies over adding third-party packages for convenience.
- Every phase must end with files changed, commands/tests actually run, accessibility checks, screenshots where UI changed, discrepancies, and a **STOP / awaiting approval** statement.

## 2. Inputs expected when integration begins

1. Current viewer repository with accepted Phase 8 tests and UI.
2. `docs/viewer/SPEC.md`, `docs/editor/SPEC.md`, `docs/editor/UX-CONTENT.md`, `docs/editor/IMPLEMENTATION.md`, `docs/editor/TESTING.md`.
3. Current schema (`schema/marin-learn-v1.schema.json`), `docs/MARKDOWN.md`, and `docs/PACKAGE.md`.
4. A functional-core handoff from v0.1.0 and its migration inventory; the untouched old ZIP is optional as diagnostic reference.
5. `examples/marinos-foundations.zip` as the fixed conforming regression fixture.
6. Read access to sibling `marin-app-template`, `marin-app-shell`, `marin-ui`, `marin-digital-standards`, `marin-skills` repositories.

The implementation MUST first reconcile duplicate implementations when the viewer already contains equivalent core features. **Prefer one current shared implementation** over importing the old modules as a second runtime.

## 3. Stage A - Functional integration

### A0. Inspect and reconcile (no code changes)

- Inventory the current viewer's shared core and the v0.1.0 handoff exports and dependencies.
- Build a behavior-and-test mapping: reuse as-is / adapt / already implemented / retire.
- Identify old DOM/CSS assumptions (`js/app.js`, `js/ui/*`, `document.execCommand`, `js/core/renderers.js`, `js/storage.js`).
- Check schema parity, package import/export, output paths, known version differences, and browser storage keys.
- Propose integration architecture, exactly which files would change, and a risk/rollback plan.

**Gate:** The user reviews the inventory and authorizes Stage A1. No implementation yet.

### A1. Merge nonvisual functionality into current shared core

- Reuse missing model CRUD, graph linking, clone/delete dependencies, ZIP import/export, validation, source inspection, asset processing, and storage adapters.
- Adapt to the viewer's current module/API structure; avoid importing a second schema-data authority.
- Add focused tests and verify that viewer output/routing does not change.
- Do not build editor UI yet.

**Gate:** Core test evidence; viewer smoke regression; no UI changes.

### A2. Mount `/editor/` and establish MarinOS shell

- Establish a separate authoring entrypoint using the current installed App Shell, local fonts/icons, and standard footer destinations.
- Use clean MarinOS basic navigation and plain placeholder forms against real application state.
- Do not import the old `index.html`, entire `css/app.css`, legacy shell, or editor sidebar.
- Ensure viewer root remains catalog and editor dependencies are excluded from learner entrypoint.

**Gate:** Visual screenshots, shell version/integration evidence, keyboard and accessibility-tree review, no regression in viewer pages.

### A3. Restore full feature pathways in a basic editor

- Enable create/open/replace/recover, metadata, objectives and hierarchy, ContentUnits, materials/sections, quizzes/questions/scoring, slides, assets, preview, validation, and export.
- Use straightforward MarinOS forms and controls. Legacy UX need not be imitated.
- A short-lived compatibility editor control MAY be quarantined behind a clearly documented temporary adapter if a richer editor replacement is deferred to Stage B; do not misrepresent it as accessible/production-ready. Any such exception must be approved explicitly and removed by Stage B acceptance.
- Keep stable IDs and preservation of canonical data mandatory.

**Gate:** Functional regression checklist, package round trip and reference fixture pass, keyboard basics, known UX limitations enumerated.

### A4. Integration and release baseline

- Run end-to-end editor tests, viewer regression, import/export, graph/reference tests, and failure recovery.
- Compare imported fixture -> exported fixture semantically and verify unchanged reader/slide/quiz presentation.
- Record dependency inventory and unresolved constraints for UX redesign. No published editor release claim until accessibility gates pass.

**Gate:** User formally accepts Stage A and provides permission to begin Stage B.

## 4. Stage B - Business-user UX redesign

### B0. Approve information architecture before code

- Provide low-fidelity screen maps for start, project overview, Reading Materials (document-first), reuse chooser, quiz, slides, assets, Review and Download.
- Show exact navigation labels and sample help/error text from `UX-CONTENT.md`.
- Explain canonical boundaries: how a material assembly and ContentUnits coexist in one editing document.
- Document proposed rich-text editor dependency with license, local vendor/build strategy, keyboard/screen-reader risks, and paste tests.

**Gate:** User approves screen maps and editor component strategy before implementation.

### B1. First-run, navigation, and overview

- Replace initial setup, overview, navigation, and local recovery copy to suit occasional authors.
- Add progressive disclosure for schema metadata and advanced settings.
- Ensure all controls still affect canonical objects and do not conceal required errors.

**Gate:** Visual, keyboard, focus, first-time-user walkthrough, and field label review.

### B2. Document-first reading materials

- Implement continuous editing canvas over the actual Material/Section/ContentUnit assembly.
- Add insert/section/reorder/reuse actions, inline editing, shared-content impact prompt, detach-versus-delete distinction, summary support, and keyboard alternatives.
- Ensure no unapproved automatic content splitting or duplicative source storage.

**Gate:** Create/edit/reuse/duplicate/reorder tests; reference integrity; visual and accessibility-tree review.

### B3. WYSIWYG and office-content paste

- Replace the temporary legacy `document.execCommand` surface with the approved constrained editor adapter.
- Implement semantic paste from Word, Google Docs, Outlook/Teams, and web pages. Preserve supported lists/tables/links/relative headings; strip font/color/office HTML.
- Provide undo and transparent handling of lossy transformations; maintain cursor/selection after toolbar dialogs.
- Verify round-trip Markdown semantics and exclusion of active content.

**Gate:** Real pasted samples, keyboard/screen-reader tests, undo tests, security tests, and no source-schema drift. This is a **hard stop** if any major data-loss or inaccessible editor issue persists.

### B4. Simplify quizzes, slides, objectives, and assets

- Introduce task-oriented forms and help text; collapse scoring, reference, advanced metadata, and other infrequently used options.
- Keep full schema functionality, including hierarchy, weight/feedback policies, slide modes and notes, source links, and contextual alt text.
- Use the viewer's shared preview logic.

**Gate:** Screenshots and complete feature regression for each resource category; novice task tests.

### B5. Validation, review, export, and recovery refinement

- Rework errors/warnings to show actionable Fix paths and plain-language guidance.
- Distinguish **Saved in this browser** from **Download Learning Package**. Never imply export equals public publishing.
- Test import replacement, IndexedDB failure, invalid ZIP, asset failures, and successful round trip.

**Gate:** Full end-to-end author journey; no blocking validation or ambiguous persistence claims.

### B6. Final accessibility, usability, and release review

- Test WCAG 2.2 AA, keyboard and accessibility-tree inspection, screen-reader smoke tests, 400% reflow, forced colors, responsive behavior, and rich-text toolbar interactions.
- Run the complete package/schema and viewer+editor regression suite.
- Conduct at least three representative novice tasks without explaining schema terminology, and record friction/adjustments. No production release without approval.

**Gate:** User accepts or rejects final UX; record remaining issues. No silent move to new feature work.

## 5. Phase completion format (mandatory)

At the end of every A/B phase, report:

```text
Phase completed:
Scope implemented:
Files added / changed / removed:
Marin App Shell integration checks:
Automated tests run and outcomes:
Manual keyboard/accessibility checks actually run:
Visual evidence (paths/screenshots):
Known issues / deviations:
User decisions required:
STOP - awaiting authorization for next phase.
```

When a phase exposes an architectural conflict, stop before committing invasive changes. Propose alternatives with impact, rather than silently changing canonical content.

## 6. Change control

- Public viewer changes require explicit mention and viewer regression evidence.
- Schema or package changes require separate approval and migrations; normal UX work should not need them.
- Rich-text parser/serializer changes require compatibility tests against the reference package and pasted fixtures.
- Security/accessibility fixes may block phase acceptance even if the feature appears usable.
- If existing code proves obsolete or unsafe, document the replacement and preserve semantic behavior rather than perpetuating the code.

## 7. Done criteria

Done means the author can create a complete package in a document-first MarinOS editor; it validates and exports; the same content renders in the accepted viewer; the no-backend model remains accurate; and novice users can complete the principal workflows without understanding the source schema. Passing functional tests alone is not completion of Stage B.

## 8. Shared editor dialog requirement

Short modal authoring interactions use the shared native HTML `<dialog>` and form utility in `editor/assets/dialogs.js`. Production editor code must not call JavaScript `prompt()`, `confirm()`, or `alert()`. Use `requestText`, `requestFields`, `requestChoice`, `confirmAction`, or, when acknowledgement is genuinely modal, `showMessage`. Prefer existing inline validation/status patterns for nonmodal errors and information.

Keep dialog input collection separate from model mutation, persistence, file generation, and export. Await the result, return on cancellation, then invoke the existing domain operation. See `docs/editor/DIALOGS.md` for the API and `docs/editor/DIALOG-MIGRATION-REPORT.md` for the migration inventory.
