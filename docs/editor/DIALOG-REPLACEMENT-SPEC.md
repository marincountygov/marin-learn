# SPEC: Marin Learn Editor Native Dialog Replacement

**Status:** Approved implementation specification
**Target:** Marin Learn `/editor/` authoring interface
**Implementation input:** The current, complete Marin Learn codebase supplied with this specification
**Primary goal:** Remove browser-native JavaScript `prompt()`, `confirm()`, and `alert()` dialogs from the editor and replace them with a shared, accessible, MarinOS-styled dialog/form system.

---

## 1. Implementation directive

Use the current full Marin Learn codebase as the source of truth. Do not assume that file paths, functions, storage mechanisms, or implementation details from an earlier version of Marin Learn are still current.

Before changing code:

1. Inspect the current `/editor/` architecture and the modules it imports.
2. Audit every browser-native JavaScript dialog reachable from the editor.
3. Trace each dialog call through the operation it controls, including creation, naming, renaming, deletion, removal, validation, persistence, export, file creation/writing, or other state changes.
4. Preserve the underlying editor behavior. This project changes how user input and confirmation are collected; it must not unnecessarily redesign the persistence, file-writing, serialization, export, or content-model layers.
5. Reuse existing MarinOS, Marin UI, Pico, App Shell, and editor patterns wherever the current codebase already provides an appropriate pattern.

If the current codebase reveals a material architectural conflict with this specification, stop and report the conflict rather than silently changing the requirement.

---

## 2. Problem statement

The Marin Learn editor currently uses one or more browser-native JavaScript dialogs such as:

```js
prompt()
confirm()
alert()
```

These dialogs are controlled by the browser rather than by Marin Learn. They do not use the application's normal MarinOS/Pico/App Shell presentation, provide limited validation and help/error-message support, and make focus, keyboard behavior, accessible naming, and automated testing harder to control consistently.

The use of a browser-native dialog must not be treated as necessary merely because the operation ultimately creates, writes, renames, deletes, persists, or exports a file or content object. The UI that collects a value or confirmation should remain separate from the code that performs the resulting editor operation.

---

## 3. Scope

### 3.1 In scope

Audit and replace **all production uses of browser-native `prompt()`, `confirm()`, and `alert()` that are reachable from the `/editor/` interface**, including uses found in:

- editor HTML;
- editor JavaScript;
- modules imported by the editor;
- shared Marin Learn modules when their native-dialog behavior is invoked by the editor;
- inline scripts or event handlers, if any;
- creation and naming workflows;
- rename/edit-name workflows;
- delete/remove confirmations;
- informational or error acknowledgement workflows currently implemented with `alert()`.

The audit must detect direct and qualified forms where applicable, including:

```js
prompt(...)
window.prompt(...)
globalThis.prompt(...)

confirm(...)
window.confirm(...)
globalThis.confirm(...)

alert(...)
window.alert(...)
globalThis.alert(...)
```

Also inspect for aliases or wrappers around these APIs when the current architecture makes them reasonably discoverable.

### 3.2 Repository-wide audit boundary

Search the complete repository so shared code is not missed.

The required replacement scope is the editor. If the audit finds native JavaScript dialogs that are exclusively used outside `/editor/`, record them in the implementation report. Do not expand the UI redesign into unrelated reader/runtime functionality unless that code is shared with and affects the editor or the user explicitly approves broader scope.

### 3.3 Out of scope

Do not attempt to replace browser-controlled UI that web applications cannot or should not reproduce, including:

- browser permission prompts;
- file-picker UI;
- download UI;
- security/interstitial UI;
- authentication UI controlled by the browser or identity provider;
- the browser's own `beforeunload`/leave-page confirmation, if one is legitimately required by the existing editor.

If a `beforeunload` confirmation exists, document it separately. Do not misclassify it as an ordinary `confirm()` replacement.

Do not redesign the Marin Learn content model, export format, file layout, persistence strategy, or reader interface as part of this work.

---

## 4. Required UI architecture

### 4.1 Native HTML `<dialog>`

Use the native HTML `<dialog>` element opened modally with `showModal()`.

Each interaction must contain a normal HTML `<form>`.

Do **not** replace the browser dialogs with:

- a generic `<div role="dialog">` implementation;
- a custom JavaScript focus trap;
- another third-party modal library;
- a framework dependency introduced solely for dialogs;
- a monkey-patch of `window.prompt`, `window.confirm`, or `window.alert`.

Use the browser's native `<dialog>` modal behavior and add only the application logic needed by Marin Learn.

### 4.2 Shared component/utility

Implement one shared editor dialog/form component or utility rather than independent one-off dialogs.

The shared implementation must support at least three semantic interaction modes:

1. **Text/value request**
   - replacement for `prompt()`;
   - supports a label, initial value when needed, validation, submit action, and cancel action.

2. **Confirmation**
   - replacement for `confirm()`;
   - supports ordinary and destructive confirmations;
   - returns an unambiguous confirmed/cancelled result.

3. **Acknowledgement/message**
   - replacement for `alert()` when a modal acknowledgement is still semantically appropriate.

For an existing `alert()` that is purely informational and does not need to interrupt the workflow, an existing editor inline status/error pattern may be more appropriate than a modal acknowledgement. In either case, the native `alert()` call must be removed.

The implementation may use one reusable `<dialog>` element whose contents/state are reset between uses, or an equivalently centralized pattern. It must not duplicate nearly identical dialog markup and behavior across individual features.

### 4.3 Conceptual API

Exact names should follow the current codebase's conventions, but the shared utility should provide semantics equivalent to:

```js
requestText(options) -> Promise<string | null>
confirmAction(options) -> Promise<boolean>
showMessage(options) -> Promise<void>
```

Equivalent result objects are acceptable if they make cancellation and submission clearer.

The public API must make it difficult for callers to confuse:

- submitted vs. cancelled;
- confirmed vs. cancelled;
- an empty accepted value vs. no value.

---

## 5. Separation of concerns

The dialog utility is responsible for:

- opening and closing the `<dialog>`;
- rendering the requested label/message;
- collecting form input;
- performing UI-level validation;
- managing dialog-specific focus;
- resolving the user's submitted/cancelled/acknowledged result.

The dialog utility is **not** responsible for:

- creating Marin Learn domain objects;
- writing or deleting files;
- modifying exported package structures;
- updating persistence storage;
- changing learning-set sequencing;
- serializing content;
- generating IDs;
- implementing unrelated business rules.

Call sites should await the dialog result and then invoke the existing editor/domain operation.

Conceptually:

```js
const title = await dialogs.requestText(...);

if (title === null) {
  return;
}

createReadingMaterial(title);
```

The actual code must use the current Marin Learn APIs and architecture rather than inventing the illustrative function above.

---

## 6. Asynchronous control-flow requirement

Browser-native `prompt()`, `confirm()`, and `alert()` are synchronous/blocking. HTML dialogs used through application code will generally require asynchronous control flow.

The implementation must explicitly account for this difference.

For every migrated call site:

1. trace the complete existing control flow;
2. convert handlers/functions to `async`/`await` or an equivalent Promise flow where appropriate;
3. preserve operation ordering;
4. prevent persistence, file creation, deletion, mutation, navigation, or other side effects from occurring before the user has submitted or confirmed;
5. ensure cancellation returns cleanly without performing the operation;
6. preserve existing error handling;
7. avoid unhandled Promise rejections.

Do not move unrelated domain logic into the dialog utility merely to simplify the asynchronous conversion.

---

## 7. Form and validation requirements

### 7.1 Required title/name inputs

For any title/name field that is required:

- an empty value is invalid;
- a whitespace-only value is invalid;
- submission must keep the dialog open;
- an inline validation message must be displayed;
- focus must remain on or return to the invalid field;
- the field must expose its invalid state programmatically;
- the error message must be programmatically associated with the field;
- the user must be able to correct the value and submit without reopening the dialog.

Do not rely solely on the browser's native validation popup.

It is acceptable to retain semantic attributes such as `required` while using application-controlled inline validation.

### 7.2 Trimming

For required name/title inputs, remove leading and trailing whitespace before accepting the value unless the current domain logic has a documented reason not to do so.

Do not collapse meaningful internal whitespace.

### 7.3 Existing constraints

Audit each existing `prompt()` call for current constraints or downstream validation, including:

- default values;
- required/optional behavior;
- allowed values;
- maximum length;
- numeric or structured input;
- duplicate-name handling;
- filename restrictions;
- content-model restrictions.

Preserve or improve those constraints rather than reducing validation to a generic non-empty check.

### 7.4 Inline errors

Inline validation errors must:

- be plain language;
- identify what must be corrected;
- not rely on color alone;
- use existing MarinOS/editor error patterns where available;
- be exposed to assistive technology without causing excessive duplicate announcements.

---

## 8. Keyboard and focus requirements

These requirements are explicit acceptance criteria.

### 8.1 On open

For text-entry dialogs:

- focus moves to the primary input when the dialog opens.

For a prefilled rename/edit field, preserve a sensible editing experience. Selecting the current value is acceptable when consistent with the current interaction and browser behavior.

For destructive confirmations:

- do not automatically focus the destructive action;
- prefer the safe Cancel action unless an established MarinOS pattern in the current codebase specifies another accessible behavior.

### 8.2 Enter

`Enter` submits the form where appropriate.

For single-line text-entry dialogs, `Enter` must submit a valid value.

Do not make `Enter` unexpectedly trigger a destructive operation merely because the destructive button happens to be first in DOM order.

If future/shared dialog content includes a multiline control, ordinary newline entry must remain possible.

### 8.3 Escape

`Escape` cancels the dialog without making changes.

Cancellation through the native `<dialog>` `cancel` event must resolve through the same application cancellation path as the visible Cancel control.

### 8.4 Visible Cancel

A visible Cancel control must be available for prompt-style and confirmation dialogs.

Cancel must:

- close the dialog;
- bypass required-field validation;
- perform no create/rename/delete/remove mutation;
- resolve the dialog operation as cancelled.

### 8.5 Focus return

After the dialog closes, focus returns to the control that opened it when that control still exists and is focusable.

If the initiating control no longer exists because of a successful operation, move focus to a logical, stable destination in the updated editor rather than allowing focus to fall unpredictably to the document body.

### 8.6 Modal containment

While opened with `showModal()`:

- keyboard focus must remain within the modal interaction according to native dialog behavior;
- background editor content must not be interactable;
- do not implement a second custom focus trap on top of native `<dialog>` behavior.

---

## 9. Dialog semantics and accessible naming

Every dialog must have a clear accessible name.

Use a visible heading and associate it with the `<dialog>` using `aria-labelledby` when needed for reliable accessible naming.

Use `aria-describedby` only when descriptive/help text materially improves the interaction.

Use native `<dialog>` semantics rather than adding redundant ARIA roles without a demonstrated need.

For form controls:

- every control has a programmatically associated visible label;
- required state is programmatically available;
- invalid state is exposed when applicable;
- inline errors are associated with their input.

The final implementation must satisfy Marin Learn/MarinOS accessibility requirements and WCAG 2.2 AA.

---

## 10. Destructive confirmations

Every current `confirm()` used for delete/remove/destructive behavior must be replaced as part of this work.

A destructive confirmation dialog must:

- clearly name the item or type of item being affected when that information is available;
- state the consequence in plain language;
- use an explicit action label such as `Delete`, `Remove`, or another operation-specific verb rather than generic `OK`;
- provide a visible `Cancel` action;
- make cancellation the safe behavior;
- never perform the destructive operation when dismissed with Escape or Cancel;
- not communicate danger through color alone;
- use existing MarinOS/Pico destructive-action styling if such a pattern already exists.

Do not add unnecessary "type DELETE to continue" interactions unless the current operation genuinely requires that level of protection and the existing product behavior supports it.

---

## 11. `alert()` replacement rules

Audit each existing `alert()` by purpose.

### Use a shared acknowledgement dialog when:

- the workflow must pause until the user acknowledges the message;
- the next operation depends on acknowledgement;
- a modal error or warning is genuinely warranted.

### Prefer an existing inline status/error presentation when:

- the message is merely informational;
- no user decision is required;
- interrupting the workflow would be unnecessary.

In either case:

- remove the native `alert()`;
- preserve meaningful error/information text;
- preserve any control-flow dependency that previously relied on `alert()` being blocking.

Do not create a new toast/notification framework solely for this project if the editor does not already have one.

---

## 12. Styling requirements

The dialogs must look like part of Marin Learn rather than browser chrome.

Use existing MarinOS, Marin UI, Pico, App Shell, and editor CSS variables/components/patterns wherever possible.

### Required styling behavior

- compatible with the application's light mode;
- compatible with the application's dark mode;
- no hard-coded light-only or dark-only palette;
- visible keyboard focus;
- sufficient contrast;
- readable at narrow viewport widths;
- no horizontal overflow at supported small widths;
- dialog content can scroll vertically when viewport height is constrained;
- action controls wrap/reflow cleanly when necessary;
- backdrop is visually distinct without obscuring the dialog;
- no dependence on color alone for state or meaning.

Keep new CSS narrowly scoped to the editor dialog component.

Do not:

- modify vendored Pico CSS for this feature;
- duplicate MarinOS brand CSS;
- introduce a new font;
- introduce an external CDN dependency;
- create broad global overrides unless the current architecture requires them and the reason is documented.

If animation is added, it must respect reduced-motion preferences. Animation is not required.

---

## 13. DOM and implementation constraints

- Place reusable dialog markup so its `<form>` is not accidentally nested inside another form.
- Use external JavaScript and CSS consistent with the current project's CSP and code organization.
- Avoid inline event-handler attributes.
- Dynamic user-controlled values such as titles, filenames, and content names must be inserted with safe DOM APIs such as `textContent` or form-control `.value`, not interpolated into unsafe `innerHTML`.
- Do not use `eval()` or equivalent dynamic execution.
- Do not weaken the current Content Security Policy.
- Do not add a third-party modal dependency.
- Do not add a build step solely for this feature.
- Preserve the existing minimal/static Marin Learn delivery model unless the supplied codebase has since intentionally changed it.

---

## 14. Dialog lifecycle and reentrancy

The shared component must cleanly reset between uses.

A newly opened dialog must not inherit stale:

- values;
- validation messages;
- `aria-invalid` state;
- descriptions;
- headings;
- button labels;
- destructive styling;
- event handlers;
- Promise resolvers.

Only one editor modal dialog should be active at a time.

The implementation must handle attempts to invoke another shared dialog while one is already active deterministically and without causing `showModal()` state errors or leaving unresolved Promises.

Choose the simplest behavior compatible with the current editor architecture; do not create an elaborate dialog queue unless actual call sites require one.

---

## 15. Behavior preservation

For every migrated native dialog, preserve all relevant behavior of the controlled operation.

Examples include:

- object type being created;
- generated IDs;
- placement/order in the learning set;
- persistence timing;
- autosave behavior;
- filenames and directory paths;
- serialization;
- export output;
- rename propagation;
- deletion cleanup;
- current selection/navigation after an operation;
- undo/history behavior, if present;
- error handling.

The dialog migration must not introduce a second code path for these domain operations.

Where possible, tests should invoke the same existing domain function after the new dialog resolves.

---

## 16. Required audit artifact

Before or as part of implementation, produce an inventory of every native JavaScript dialog found in editor scope.

For each occurrence record:

| Field | Required content |
| --- | --- |
| Source | File and function/handler |
| Native API | `prompt`, `confirm`, or `alert` |
| Purpose | What the user is being asked/told |
| Controlled operation | What happens after the dialog |
| Existing default/input | Any default value or special handling |
| Replacement | Text request, confirmation, acknowledgement, or inline status |
| Async impact | Whether caller/control flow must become async |
| Validation | Existing and required validation |
| Regression risk | Persistence, file-writing, deletion, navigation, etc. |

The final implementation report should include the completed inventory or an equivalent concise table.

---

## 17. Automated testing requirements

Use the project's existing test infrastructure where practical. Do not introduce a heavyweight test framework solely for this change.

### 17.1 Native-dialog regression guard

Add an automated check that fails if production editor code reintroduces direct use of:

```js
prompt()
confirm()
alert()
window.prompt()
window.confirm()
window.alert()
globalThis.prompt()
globalThis.confirm()
globalThis.alert()
```

The check should exclude vendored code, generated artifacts, and test fixtures as appropriate.

It may use source scanning if that is the simplest reliable approach in the current repository.

### 17.2 Shared dialog utility tests

Test at least:

- text dialog resolves with submitted value;
- text dialog resolves as cancelled from Cancel;
- text dialog resolves as cancelled from Escape;
- required empty value stays open;
- whitespace-only required value stays open;
- inline validation appears;
- corrected valid value can then submit;
- leading/trailing whitespace is handled as specified;
- initial/default value is preserved where required;
- confirmation resolves true only from the explicit confirm action;
- Cancel resolves false;
- Escape resolves false;
- destructive cancel performs no destructive side effect;
- acknowledgement closes cleanly;
- component state is reset before reuse;
- repeated sequential use does not accumulate handlers or stale state.

### 17.3 Focus and keyboard tests

Automate where supported by the existing browser-test tooling:

- opening a text dialog focuses the input;
- Tab/Shift+Tab behavior remains inside the modal;
- Enter submits an appropriate valid single-line form;
- Escape cancels;
- focus returns to the invoker on cancel;
- focus moves to the intended post-operation destination when the invoker disappears after a successful action.

### 17.4 Integration/regression tests

For representative editor workflows, verify:

- create operation produces the same resulting editor/domain state as before;
- rename operation updates the same state as before;
- delete/remove operation changes state only after confirmation;
- cancellation leaves state unchanged;
- persistence/export/file-writing behavior remains correct;
- operation ordering remains correct after asynchronous conversion.

Where deterministic fixtures make it feasible, compare serialized/output state before and after the UI migration.

### 17.5 Existing browser smoke tests

If the current repository already contains browser smoke/integration tests, extend them rather than creating a parallel browser-test system.

The smoke coverage must exercise at least one:

- create/name dialog;
- destructive confirmation;
- cancelled operation;
- validation failure and correction.

---

## 18. Manual/human verification

Provide a manual test checklist with the implementation. At minimum, run or instruct the reviewer to run the following.

### 18.1 Browser coverage

Test the editor in current supported versions of:

- Firefox;
- Chromium-based browser such as Edge or Chrome;
- Safari where available and within Marin Learn's supported browser policy.

If a browser cannot be tested in the implementation environment, mark it explicitly as a human/manual test rather than claiming it passed.

### 18.2 Light and dark mode

For every dialog type:

- verify light mode;
- verify dark mode;
- verify text, borders, backdrop, focus indicators, error states, and buttons remain legible;
- confirm no browser-native prompt styling remains.

### 18.3 Keyboard-only workflow

Without a mouse:

1. navigate to the control that opens the dialog;
2. open it;
3. confirm focus placement;
4. Tab and Shift+Tab through the dialog;
5. submit with Enter where appropriate;
6. reopen;
7. cancel with Escape;
8. reopen;
9. cancel with the visible Cancel control;
10. confirm focus returns appropriately each time.

Repeat for at least one destructive confirmation.

### 18.4 Validation

For every required title/name workflow:

1. submit an empty value;
2. submit spaces only;
3. verify dialog remains open;
4. verify inline error is visible;
5. inspect the accessibility representation to verify the field is marked invalid and the error is associated;
6. correct the value;
7. submit successfully;
8. verify the resulting content is created/named correctly.

### 18.5 Accessibility-tree inspection

Using a browser-neutral accessibility inspection workflow, verify:

- the modal is represented as a dialog;
- the dialog has a meaningful accessible name;
- explanatory text is associated when applicable;
- the input has the correct accessible name;
- required state is present;
- invalid state appears after validation failure;
- the inline error is programmatically associated with the input;
- background content is not exposed as an active interaction target while the modal is open;
- buttons have meaningful accessible names;
- destructive actions are identifiable by text, not only presentation.

### 18.6 Responsive/reflow testing

Test at:

- a narrow mobile-like viewport;
- a typical desktop viewport;
- browser zoom sufficient to exercise reflow, including 200% and, where practical, 400%.

Verify:

- no required content is clipped;
- no horizontal scrolling is introduced by the dialog;
- action buttons remain usable;
- long titles/messages wrap;
- vertically constrained content remains reachable.

### 18.7 Operation regression

Manually exercise every migrated call site, not merely one representative dialog.

For each:

- perform the positive action;
- cancel it;
- verify the resulting editor state;
- reload/reopen as appropriate to verify persistence;
- export/write files when that workflow is affected;
- inspect output to confirm no unexpected content-model or file-layout change.

---

## 19. Accessibility acceptance criteria

The implementation is not complete until all of the following are true:

- native editor `prompt()`, `confirm()`, and `alert()` calls are removed;
- every modal uses native HTML `<dialog>` with `showModal()`;
- each modal interaction contains a normal `<form>`;
- each dialog has a programmatically determinable accessible name;
- text inputs have visible labels;
- required fields expose required state;
- invalid fields expose invalid state and associated inline errors;
- keyboard-only operation is complete;
- Escape cancels safely;
- focus placement and focus return are deterministic;
- destructive actions cannot occur on cancellation;
- visible focus indicators remain intact;
- light/dark mode remain usable;
- reflow does not break the dialog;
- automated and manual accessibility-tree checks pass.

Target: **WCAG 2.2 AA**, consistent with the current MarinOS/Marin digital accessibility standards.

---

## 20. Functional acceptance criteria

The implementation is complete when:

1. All in-scope native JavaScript dialogs have been inventoried.
2. All in-scope `prompt()`, `confirm()`, and `alert()` calls have been replaced.
3. A single shared editor dialog/form system is used.
4. Creation/naming dialogs use proper form inputs and inline validation.
5. Empty and whitespace-only required values cannot submit.
6. Every existing destructive `confirm()` has an accessible custom confirmation dialog.
7. Alert behavior has been migrated to either the shared acknowledgement dialog or an appropriate existing inline status mechanism.
8. Cancel and Escape produce no unintended mutations.
9. Underlying persistence/file-writing/export behavior is unchanged except where a verified bug must be fixed.
10. Asynchronous conversion introduces no race conditions or unhandled Promise rejections.
11. Automated tests pass.
12. A regression guard prevents native dialog APIs from being reintroduced into production editor code.
13. Manual test instructions are provided.
14. The implementation report identifies any tests that could not be run in the implementation environment.
15. No unnecessary dependency, build step, or unrelated UI redesign is introduced.

---

## 21. Code quality requirements

- Follow existing Marin Learn naming, module, and formatting conventions.
- Keep the shared dialog API small.
- Do not reproduce domain logic inside dialog code.
- Prefer configuration/data over duplicated markup.
- Remove obsolete native-dialog-specific code after migration.
- Do not leave dead compatibility paths.
- Do not suppress exceptions merely to make tests pass.
- Add comments only where the asynchronous/lifecycle behavior is not self-evident.
- Keep changes focused on this feature.

---

## 22. Documentation requirements

Update the appropriate project documentation when the current repository conventions call for it.

At minimum, document:

- that editor interactions must use the shared dialog utility rather than JavaScript `prompt()`, `confirm()`, or `alert()`;
- where the shared component lives;
- how to invoke each supported interaction mode;
- how required validation is supplied;
- how cancellation is represented;
- any conventions for destructive confirmation wording.

If the repository has a changelog, add a concise entry consistent with existing release conventions.

---

## 23. Required implementation report

When implementation is complete, return a report containing:

### Summary

A concise description of the change.

### Native-dialog audit

The inventory described in Section 16.

### Files changed

List every changed/added/removed file and its purpose.

### Architecture

Explain:

- where the shared dialog component lives;
- how the Promise/result API works;
- how call sites were converted from blocking native dialogs to asynchronous dialog interactions;
- how domain/persistence/file-writing logic remains separated.

### Automated tests

List:

- tests added or updated;
- commands run;
- pass/fail results.

### Manual tests performed

List what was actually tested manually in the implementation environment.

### Human/manual tests still required

Provide exact steps for anything that could not be verified automatically or in the available environment, especially:

- browser coverage;
- dark/light mode;
- accessibility-tree inspection;
- keyboard-only testing;
- zoom/reflow;
- assistive-technology smoke testing if appropriate.

### Known limitations

State any remaining limitation explicitly. Do not describe an untested item as passing.

---

## 24. Expected implementation deliverables

Provide:

1. the updated Marin Learn codebase or a clean patch, according to the user's instruction in the implementation session;
2. all new/updated automated tests;
3. any updated project documentation;
4. the implementation/test report described above;
5. the exact commands needed to rerun the automated test suite;
6. the manual accessibility and browser test checklist.

Do not include temporary test output, browser profiles, caches, generated coverage junk, local dependency directories, or other non-production artifacts in the final code package unless the repository intentionally tracks them.

---

## 25. Decision record

The following decisions are already approved and should not be re-litigated unless the supplied code reveals a genuine technical conflict:

- Audit and replace all editor uses of `prompt()`, `confirm()`, and `alert()`.
- Use native HTML `<dialog>` containing a normal `<form>`.
- Style through existing MarinOS/Pico/App Shell/editor patterns.
- Use one shared editor dialog/form component or utility.
- Required name/title fields reject empty and whitespace-only values.
- Validation remains in the open dialog and uses an inline error message.
- Focus moves to the primary input for text-entry dialogs.
- Enter submits where appropriate.
- Escape cancels without changes.
- Visible Cancel cancels without changes.
- Focus returns to the opener or a logical post-operation target.
- Destructive `confirm()` calls are part of this implementation.
- Automated testing and explicit human/manual accessibility testing are required.

---

## 26. Definition of done

This work is done when the Marin Learn editor no longer depends on browser-native JavaScript dialogs for ordinary authoring interactions, all affected workflows use the shared accessible `<dialog>`/`<form>` system, existing editor behavior and persistence/output semantics are preserved, automated regression coverage is in place, and the implementation has a documented human-verification path for accessibility and browser behavior.
