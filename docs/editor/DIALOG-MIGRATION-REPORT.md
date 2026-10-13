# Editor dialog migration report

**Status:** Implementation complete; automated non-navigation checks pass. Full application browser integration remains a required human/CI verification because this implementation environment blocks browser navigation to local URLs.

**Implementation basis:** `docs/editor/DIALOG-REPLACEMENT-SPEC.md` and the supplied full Marin Learn source.

## Summary

The `/editor/` production code no longer calls browser-native JavaScript `prompt()`, `confirm()`, or `alert()` APIs.

The replacement is one shared editor service in `editor/assets/dialogs.js`. It creates and reuses a native HTML `<dialog>` containing a normal `<form>`, opens it with `showModal()`, and exposes Promise-based request methods. Existing editor/domain functions still perform project mutations, persistence, package serialization, and export work after a submitted or confirmed result.

The baseline audit found **28 direct native-dialog calls** in six editor files:

- 17 `prompt()` calls;
- 8 `confirm()` calls; and
- 3 `alert()` calls.

All 28 have been removed from production editor code. The repository-wide production scan found no additional editor-reachable aliases or wrappers and no native-dialog calls exclusive to the learner viewer. A source regression test now fails if a direct native-dialog API is reintroduced under `editor/` or shared `js/` production code.

## Native-dialog audit

| # | Source and location | Native API | Existing interaction | Replacement | Async and validation impact | Principal regression risk |
|---:|---|---|---|---|---|---|
| 1 | `editor/assets/rich-editor.js` — `insertLink()` | `window.prompt()` | Collect link destination; no default | `dialogs.requestText()` | Toolbar command awaits a required, trimmed value validated against the existing safe-link rule | Preserve selection, link text, and caret placement |
| 2 | `editor/assets/rich-editor.js` — `insertTable()` rows | `window.prompt()` | Body-row count; default `2` | One `dialogs.requestFields()` form shared with columns | Requires a whole number from 1 through 10 | Preserve table dimensions and insertion point |
| 3 | `editor/assets/rich-editor.js` — `insertTable()` columns | `window.prompt()` | Column count; default `2` | Same multi-field form as row count | Requires a whole number from 1 through 8 | Preserve header/body structure and caret placement |
| 4 | `editor/assets/rich-editor.js` — fallback `insertImage()` asset reference | `window.prompt()` | Collect `marin-asset:<uuid>` reference; no default | One `dialogs.requestFields()` form shared with image description | Requires a UUID with optional `marin-asset:` or `urn:uuid:` prefix | Preserve stable asset reference syntax and selection range |
| 5 | `editor/assets/rich-editor.js` — fallback `insertImage()` description | `window.prompt()` | Collect alternative text; default empty | Same multi-field image form | Optional; blank continues to represent a decorative image | Preserve image insertion and Markdown output |
| 6 | `editor/assets/objectives.js` — add objective handler | `window.prompt()` | Objective title; default `New learning objective` | `dialogs.requestText()` | Handler awaits required, trimmed title and shows inline validation | Preserve objective creation, membership, and persistence |
| 7 | `editor/assets/objectives.js` — rename objective handler | `window.prompt()` | Current objective name | `dialogs.requestText()` | Handler awaits required, trimmed title | Preserve stable ID, slug update, references, and persistence |
| 8 | `editor/assets/objectives.js` — delete objective with usages | `window.confirm()` | Confirm deletion and association removal | Destructive `dialogs.confirmAction()` | Explicit Delete/Cancel result is awaited; Cancel/Escape performs no mutation | Preserve association cleanup and objective-set behavior |
| 9 | `editor/assets/objectives.js` — delete unused objective | `window.confirm()` | Confirm deletion | Destructive `dialogs.confirmAction()` | Same safe cancellation path | Preserve deletion and post-delete focus |
| 10 | `editor/assets/assets.js` — delete used image | `window.confirm()` | Confirm asset-file deletion and warn about broken references | Destructive `dialogs.confirmAction()` | Confirmation is awaited and names current usages | Preserve asset-file cleanup and reference behavior |
| 11 | `editor/assets/assets.js` — delete unused image | `window.confirm()` | Confirm permanent asset deletion | Destructive `dialogs.confirmAction()` | Same safe cancellation path | Preserve graph and asset-file deletion |
| 12 | `editor/assets/assets.js` — image upload failure in insert-image modal | `alert()` | Report rejected/failed upload | Inline error region inside the existing insert-image modal | No modal interruption; message is exposed with `role="alert"` and focus remains in the workflow | Preserve upload validation and allow recovery without closing the picker |
| 13 | `editor/assets/assets.js` — missing image description | `alert()` | Require description or decorative choice | Field-associated inline validation | Sets `aria-invalid`, exposes an associated error, and focuses the description input | Preserve accessible-image requirement |
| 14 | `editor/assets/assets.js` — no selected image | `alert()` | Require an image choice | Inline error region in the picker | Keeps picker open and focuses the first available choice | Prevent insertion without a valid asset |
| 15 | `editor/assets/slides.js` — rename deck handler | `window.prompt()` | Current deck name | `dialogs.requestText()` | Handler awaits required, trimmed title | Preserve stable ID, slug, active deck, and persistence |
| 16 | `editor/assets/slides.js` — `createNewDeck()` | `window.prompt()` | Deck title; default `New Slide Deck` | `dialogs.requestText()` | Required inline validation | Preserve presentation creation and active selection |
| 17 | `editor/assets/slides.js` — delete deck handler | `window.confirm()` | Confirm removal of deck from project | Destructive `dialogs.confirmAction()` | Safe action is initially focused; cancellation makes no change | Preserve slide records, graph references, active-deck selection, and persistence |
| 18 | `editor/assets/quizzes.js` — rename quiz handler | `window.prompt()` | Current quiz name | `dialogs.requestText()` | Handler awaits required, trimmed title | Preserve stable ID, slug, active quiz, and persistence |
| 19 | `editor/assets/quizzes.js` — `createNewQuiz()` | `window.prompt()` | Quiz title; default `New Quiz` | `dialogs.requestText()` | Required inline validation | Preserve assessment creation and active selection |
| 20 | `editor/assets/quizzes.js` — delete quiz handler | `window.confirm()` | Confirm removal of quiz from project | Destructive `dialogs.confirmAction()` | Safe action is initially focused; cancellation makes no change | Preserve question records, graph references, active-quiz selection, and persistence |
| 21 | `editor/assets/materials.js` — rename material handler | `window.prompt()` | Current reading-material title | `dialogs.requestText()` | Handler awaits required, trimmed title | Preserve stable ID, slug, active material, and persistence |
| 22 | `editor/assets/materials.js` — rename section action | `window.prompt()` | Current section title | `dialogs.requestText()` | Action handler awaits required, trimmed title | Preserve section identity, nesting, slug, and persistence |
| 23 | `editor/assets/materials.js` — move into sibling section | `window.prompt()` | Numbered text choice; default `1` | `dialogs.requestChoice()` with a labeled `<select>` | Returns only an eligible section ID; no numeric parsing path remains | Preserve sequence transfer and allowed nesting rules |
| 24 | `editor/assets/materials.js` — `createNewMaterial()` | `window.prompt()` | Material title; default `New Reading Material` | `dialogs.requestText()` | Required inline validation | Preserve material creation, active selection, and persistence |
| 25 | `editor/assets/materials.js` — `addSection()` | `window.prompt()` | Section/subsection title; matching default title | `dialogs.requestText()` | Required inline validation; calling action now awaits completion | Preserve nesting depth and sequence insertion |
| 26 | `editor/assets/materials.js` — `addContentUnit()` | `window.prompt()` | Content title; default `New Topic` | `dialogs.requestText()` | Required inline validation; calling action now awaits completion | Preserve content file creation, active editor state, and sequence insertion |
| 27 | `editor/assets/materials.js` — content-library delete with usages | `window.confirm()` | Confirm content and Markdown-file deletion; list usages | Destructive `dialogs.confirmAction()` | Confirmation is awaited; consequence text names current usages | Preserve reference cleanup and Markdown-file deletion |
| 28 | `editor/assets/materials.js` — delete unused content block | `window.confirm()` | Confirm content and Markdown-file deletion | Destructive `dialogs.confirmAction()` | Same safe cancellation path | Preserve graph and content-file deletion |

## Architecture

### Shared component

`createEditorDialogs()` owns one native `HTMLDialogElement` and one reusable form. It builds markup with DOM APIs and sets user-controlled values through `textContent` or form-control `.value`; it does not interpolate dialog content through `innerHTML`.

The public API is:

```js
requestText(options)       // Promise<string | null>
requestFields(options)     // Promise<object | null>
requestChoice(options)     // Promise<string | null>
confirmAction(options)     // Promise<boolean>
showMessage(options)       // Promise<void>
```

A `null`/`false` result always means the operation was cancelled or not submitted. Callers perform domain mutations only after a positive result.

### Lifecycle and reentrancy

Only one shared editor dialog may be active. A concurrent request resolves as cancelled and leaves the active interaction untouched. The service also tracks internally generated `close` events so a delayed event from one request cannot cancel a quickly opened sequential request.

Every request resets fields, labels, errors, ARIA state, button text, and destructive styling before reuse.

### Validation

Required text inputs are trimmed. Empty and whitespace-only values keep the dialog open, display a field-level message, set `aria-invalid="true"`, expose `aria-errormessage`, and return focus to the field. Number fields support whole-number and min/max validation. Callers may provide additional synchronous validation without moving domain logic into the component.

### Keyboard and focus

- text and multi-field dialogs focus the primary field;
- Enter submits valid single-line forms;
- Escape and the visible Cancel control resolve as cancelled;
- destructive confirmations initially focus Cancel;
- focus returns to the invoking control, its enclosing disclosure summary, or a stable main-region fallback;
- successful rerenders set a logical post-operation focus target where the original invoker is removed; and
- native `showModal()` supplies modal focus containment and background inertness without a custom focus trap.

### Rich-editor selection preservation

Link, table, and fallback-image commands clone the current contenteditable range before opening the asynchronous dialog. The range is checked again before mutation so stale/disconnected selections are not used. The toolbar control is supplied as the explicit focus-return target.

### Alert replacements

The three former image-picker alerts were validation and upload-recovery messages rather than decisions. They now remain inside the existing picker as inline errors instead of opening a second acknowledgement modal.

## Files changed

### Production code

- `editor/assets/dialogs.js` — new shared native dialog/form service.
- `editor/assets/app.js` — creates one service and injects it into editor modules.
- `editor/assets/app.css` — MarinOS/Pico-compatible dialog, error, destructive-action, responsive, and forced-colors styles.
- `editor/assets/materials.js` — material/section/content prompts, section choice, and content deletion migration.
- `editor/assets/objectives.js` — objective create/rename/delete migration.
- `editor/assets/assets.js` — asset deletion confirmation and inline image-picker errors.
- `editor/assets/quizzes.js` — quiz create/rename/delete migration.
- `editor/assets/slides.js` — deck create/rename/delete migration.
- `editor/assets/rich-editor.js` — asynchronous link/table/fallback-image forms with selection preservation.

### Tests and test runner

- `tests/editor-dialogs.test.mjs` — source guard and architecture/CSS contract tests.
- `tests/browser_editor_dialog_component.py` — isolated production-component browser test that does not require local URL navigation.
- `tests/browser_editor_dialogs.py` — full editor integration, validation, focus, destructive, reflow, and dark-mode browser test.
- `tests/browser_editor_smoke.py` — existing create-material/content workflow migrated from browser-dialog interception.
- `tests/test_materials_r2b.py`
- `tests/test_paste_r2c.py`
- `tests/test_quizzes_r3.py`
- `tests/test_slides_r4.py`
- `tests/test_validation_r6.py` — existing browser tests migrated to the shared dialog form.
- `scripts/check.sh` — includes both dialog browser tests in `--browser` mode.

### Documentation

- `docs/editor/DIALOGS.md` — contributor contract and usage examples.
- `docs/editor/DIALOG-REPLACEMENT-SPEC.md` — approved implementation specification retained with the project.
- `docs/editor/DIALOG-MIGRATION-REPORT.md` — this audit and verification report.
- `docs/editor/IMPLEMENTATION.md` — shared dialog architecture rule.
- `docs/editor/TESTING.md` — regression and human-verification requirements.
- `CHANGELOG.md` — unreleased change entry.

## Automated verification performed

### Complete non-browser project check

Command:

```bash
bash scripts/check.sh
```

Result: **PASS**.

This run completed the repository's security/configuration checks, template checks, JavaScript syntax checks, Python checks invoked by the script, and **87 Node test cases** with zero failures. Browser suites were intentionally skipped because `--browser` was not supplied.

### Isolated native-dialog browser test

Command:

```bash
python3 tests/browser_editor_dialog_component.py
```

Result: **PASS** in headless system Chromium.

The test runs the production dialog module in an isolated document and verifies:

- native modal `<dialog>` and nested `<form>`;
- accessible dialog naming;
- primary-field focus and native required state;
- native modal focus behavior that prevents Tab from reaching background controls;
- whitespace-only rejection and inline ARIA error state;
- trimmed submission;
- Enter submission;
- Escape cancellation and focus return;
- multi-field integer/min/max validation and parsed results;
- choice submission and state reset;
- destructive confirmation safe focus and cancellation;
- acknowledgement behavior;
- deterministic concurrent-request cancellation;
- sequential-request lifecycle safety;
- narrow-viewport containment without horizontal overflow; and
- token-driven dark-mode surface and text resolution.

### Source guard

Command:

```bash
node --test tests/editor-dialogs.test.mjs
```

Result: **PASS** — 4 tests, zero failures.

The guard confirms that production `editor/` and shared `js/` code contain no direct `prompt()`, `confirm()`, or `alert()` invocation and no monkey-patching of those globals.

### Python syntax verification

Command:

```bash
python3 -m py_compile \
  tests/browser_editor_dialog_component.py \
  tests/browser_editor_dialogs.py \
  tests/browser_editor_smoke.py \
  tests/test_materials_r2b.py \
  tests/test_paste_r2c.py \
  tests/test_quizzes_r3.py \
  tests/test_slides_r4.py \
  tests/test_validation_r6.py
```

Result: **PASS**.

## Browser integration limitation in this environment

Command attempted:

```bash
python3 tests/browser_editor_dialogs.py
```

The test could not reach application code. The installed Chromium is governed by an environment policy that rejects local navigation with:

```text
Page.goto: net::ERR_BLOCKED_BY_ADMINISTRATOR
```

The same policy blocks `http://127.0.0.1/...` and `file:///...` navigation. This is an execution-environment limitation, not a passing browser-integration result. The complete integration test remains in the repository and must be run in normal development/CI browser infrastructure.

## Human/manual verification still required

Run the editor from a normal local web server or its deployed test URL and complete the following.

### Supported browsers

Verify current supported releases of Firefox, Edge or Chrome, and Safari where available. Run:

```bash
bash scripts/check.sh --browser
```

The test environment must permit browser navigation to the local server used by the Playwright suites.

### Every migrated workflow

Exercise positive submission and cancellation for:

- create and rename reading material;
- create and rename section/subsection;
- create content block;
- select a destination section;
- delete a content block from the content library, with and without usages;
- create, rename, and delete a learning objective, including an objective with associations;
- create, rename, and delete a quiz;
- create, rename, and delete a slide deck;
- delete an image, both used and unused;
- insert a rich-editor link;
- insert a rich-editor table;
- fallback asset-reference image insertion, where that fallback is reachable; and
- image-picker upload error, missing description, and missing selection states.

For each operation, verify persistence after reload and package export when the affected resource participates in exported output.

### Keyboard-only behavior

For representative text, choice, and destructive dialogs:

1. open the dialog from the keyboard;
2. confirm initial focus;
3. use Tab and Shift+Tab through the controls;
4. submit with Enter where appropriate;
5. cancel with Escape;
6. cancel with the visible Cancel control;
7. confirm no mutation after either cancellation path; and
8. confirm focus returns to the opener or the intended post-operation target.

### Accessibility-tree inspection

Using browser-neutral accessibility inspection, verify:

- the element is exposed as a modal dialog;
- the visible heading supplies its accessible name;
- description/help text is associated only when present;
- fields have visible and programmatic labels;
- required state is exposed;
- invalid state and the inline error association appear after failed submission;
- buttons have operation-specific names;
- the destructive action is identifiable through text, not color alone; and
- background editor controls are not active interaction targets while the dialog is open.

### Visual and reflow checks

Check light and dark mode, visible focus indicators, forced-colors mode where available, long titles/messages, a narrow mobile-like viewport, 200% zoom, and 400% reflow. Confirm that content remains reachable, actions wrap cleanly, and no horizontal scrolling is introduced by the dialog.

### Assistive-technology smoke check

Where available, perform at least one screen-reader smoke test covering dialog announcement, required/invalid state, error announcement, destructive confirmation, cancellation, and focus return.

## Known limitations and intentionally unchanged areas

- Existing editor overlays implemented as custom `div[role="dialog"]` were outside this native-JavaScript-dialog replacement scope and were not redesigned.
- Safari and Firefox could not be executed in this implementation environment.
- Full editor integration could not be browser-executed here because of the local-navigation policy described above.
- The implementation targets current browsers with native `<dialog>` and `showModal()` support; it does not add a third-party polyfill.
