# Marin Learn editor dialogs

Marin Learn authoring uses one shared native HTML `<dialog>` implementation for short modal interactions. Production editor code must not call JavaScript `prompt()`, `confirm()`, or `alert()`.

## Component

The implementation is in `editor/assets/dialogs.js` and is created once by `editor/assets/app.js`:

```js
const editorDialogs = createEditorDialogs();
```

The utility creates one `<dialog>` containing one normal `<form>`, then safely rebuilds the form fields for each operation. It uses `showModal()` so the browser supplies modal focus containment and makes the rest of the document unavailable while the dialog is open. Marin Learn does not add a second focus trap or a third-party modal dependency.

The component exposes:

```js
requestText(options)       // Promise<string | null>
requestFields(options)     // Promise<Record<string, unknown> | null>
requestChoice(options)     // Promise<string | null>
confirmAction(options)     // Promise<boolean>
showMessage(options)       // Promise<void>
```

Cancellation is unambiguous:

- text, fields, and choice requests resolve to `null`;
- confirmation resolves to `false`;
- acknowledgement resolves after it closes.

Only one shared dialog may be open at a time. A second programmatic request made while one is active is ignored and resolves as cancelled; it cannot call `showModal()` a second time or leave a Promise unresolved.

The service owns the dialog lifecycle, including its internally queued `close` events. This prevents a delayed `close` event from one request from cancelling a new request opened immediately afterward. Feature code must not call the shared element's `close()` method directly.

## Text input

Use `requestText()` for create and rename operations:

```js
const title = await dialogs.requestText({
  title: 'Create reading material',
  label: 'Reading material title',
  value: 'New Reading Material',
  requiredMessage: 'Enter a reading material title.',
  submitLabel: 'Create'
});

if (title === null) return;
createMaterial(pkg, title);
```

Required text is trimmed. An empty or whitespace-only value keeps the dialog open, sets `aria-invalid`, displays an inline error, associates the error through `aria-describedby` and `aria-errormessage`, and returns focus to the invalid field.

Custom validation returns a plain-language error string:

```js
validate(value) {
  return value.startsWith('https:') ? '' : 'Enter an HTTPS link.';
}
```

## Multiple fields

Use `requestFields()` when one operation needs related values. The rich-text table command uses one dialog for body rows and columns rather than opening two consecutive prompts.

Supported field controls are text-like inputs, number inputs, textareas, and selects. Field configuration may include required state, help text, minimum and maximum values, integer validation, a parser, and custom validation.

## Choice

Use `requestChoice()` when the valid options are known. For example, moving a reading-material item into another section uses a labeled select instead of asking the author to type a number.

## Destructive confirmation

Use `confirmAction()` for delete operations:

```js
const confirmed = await dialogs.confirmAction({
  title: 'Delete quiz?',
  description: `Delete “${quiz.name}” from this project? Existing question records are not deleted.`,
  submitLabel: 'Delete quiz',
  destructive: true
});

if (!confirmed) return;
deleteQuiz();
```

Requirements:

- name the affected item when available;
- state the consequence;
- use the operation verb, not `OK`;
- keep a visible Cancel action;
- focus Cancel when the destructive dialog opens;
- treat Escape and Cancel identically;
- perform no mutation until confirmation resolves `true`.

## Informational and validation messages

Use `showMessage()` only when a modal acknowledgement is necessary. Prefer an existing inline status or validation region when the user does not need to acknowledge a message.

The image-insertion workflow uses inline errors for upload failure, missing alternative text, and missing image selection. This keeps the current image form open and places the error next to the affected workflow rather than opening another modal.

## Keyboard and focus

The shared component guarantees:

- text dialogs focus the primary field;
- Enter submits an appropriate form;
- Escape cancels safely;
- the visible Cancel control bypasses validation;
- destructive confirmations initially focus Cancel;
- closing returns focus to the invoking control when it remains available;
- callers that rerender after success move focus to the created, renamed, neighboring, or empty-state control.

Do not add custom Tab trapping. Native modal `<dialog>` behavior owns focus containment.

## Styling

`editor/assets/app.css` contains the scoped `.editor-dialog*` rules. They use current MarinOS/Pico tokens, support light and dark color schemes, reflow at narrow widths, allow vertical scrolling in short viewports, preserve focus indicators, and include forced-colors behavior.

Do not edit vendored Pico/MarinOS CSS for an editor dialog. Do not add an external modal library, CDN resource, font, or build step.

## Regression rule

`tests/editor-dialogs.test.mjs` scans production editor JavaScript and fails if it finds direct `prompt()`, `confirm()`, or `alert()` calls or monkey-patching of those globals.

New modal editor interactions must use the shared utility. New nonmodal validation should use an existing inline error/status pattern.
