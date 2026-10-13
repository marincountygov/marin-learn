const DEFAULT_DIALOG_ID = 'editor-shared-dialog';
const TEXT_LIKE_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password']);

/**
 * Create the shared Marin Learn editor dialog service.
 *
 * The service owns one native HTMLDialogElement and reconfigures the form for
 * text requests, multi-field requests, choices, confirmations, and messages.
 * Domain mutations remain in the calling editor modules.
 */
export function createEditorDialogs({ documentRef = document, id = DEFAULT_DIALOG_ID } = {}) {
  if (!documentRef?.body) {
    throw new Error('The editor dialog service requires a document with a body.');
  }

  let dialog = documentRef.getElementById(id);
  if (dialog?.__marinEditorDialogsApi) return dialog.__marinEditorDialogsApi;

  if (!dialog) {
    dialog = buildDialog(documentRef, id);
    documentRef.body.append(dialog);
  }

  if (!(dialog instanceof documentRef.defaultView.HTMLDialogElement)) {
    throw new Error(`#${id} must be a native <dialog> element.`);
  }

  const form = dialog.querySelector('[data-editor-dialog-form]');
  const title = dialog.querySelector('[data-editor-dialog-title]');
  const description = dialog.querySelector('[data-editor-dialog-description]');
  const fieldsHost = dialog.querySelector('[data-editor-dialog-fields]');
  const cancelButton = dialog.querySelector('[data-editor-dialog-cancel]');
  const submitButton = dialog.querySelector('[data-editor-dialog-submit]');

  if (!form || !title || !description || !fieldsHost || !cancelButton || !submitButton) {
    throw new Error('The shared editor dialog markup is incomplete.');
  }

  let activeRequest = null;
  let requestCounter = 0;
  let pendingInternalCloseEvents = 0;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!activeRequest) return;

    const values = validateAndCollect(activeRequest.fields);
    if (!values) return;

    finishRequest({ submitted: true, values });
  });

  cancelButton.addEventListener('click', () => {
    if (!activeRequest) return;
    finishRequest({ submitted: false, values: null });
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!activeRequest) return;
    finishRequest({ submitted: false, values: null });
  });

  // A close event is queued after dialog.close(). Ignore events created by
  // this component so a fast, sequential request cannot be cancelled by the
  // preceding request's delayed close event. Direct external closes still
  // resolve the active request as cancelled.
  dialog.addEventListener('close', () => {
    if (pendingInternalCloseEvents > 0) {
      pendingInternalCloseEvents -= 1;
      return;
    }
    if (!activeRequest) return;
    finishRequest({ submitted: false, values: null }, { alreadyClosed: true });
  });

  function requestFields(options = {}) {
    const fields = Array.isArray(options.fields) ? options.fields : [];
    return openDialog({
      ...options,
      mode: options.mode || 'fields',
      fields,
      showCancel: options.showCancel !== false,
      submitLabel: options.submitLabel || 'Continue',
      cancelLabel: options.cancelLabel || 'Cancel'
    }).then((result) => (result.submitted ? result.values : null));
  }

  async function requestText(options = {}) {
    const fieldName = options.name || 'value';
    const values = await requestFields({
      ...options,
      mode: 'text',
      fields: [{
        name: fieldName,
        label: options.label || 'Value',
        type: options.type || 'text',
        value: options.value ?? '',
        required: options.required !== false,
        requiredMessage: options.requiredMessage,
        helpText: options.helpText,
        autocomplete: options.autocomplete ?? 'off',
        inputMode: options.inputMode,
        min: options.min,
        max: options.max,
        step: options.step,
        maxLength: options.maxLength,
        trim: options.trim !== false,
        select: options.select !== false,
        validate: options.validate,
        parse: options.parse
      }]
    });
    return values ? values[fieldName] : null;
  }

  async function requestChoice(options = {}) {
    const fieldName = options.name || 'value';
    const values = await requestFields({
      ...options,
      mode: 'choice',
      fields: [{
        name: fieldName,
        label: options.label || 'Choose an option',
        type: 'select',
        value: options.value ?? '',
        required: options.required !== false,
        requiredMessage: options.requiredMessage,
        helpText: options.helpText,
        options: options.options || [],
        validate: options.validate,
        parse: options.parse
      }]
    });
    return values ? values[fieldName] : null;
  }

  async function confirmAction(options = {}) {
    const result = await openDialog({
      ...options,
      mode: 'confirm',
      fields: [],
      showCancel: true,
      submitLabel: options.submitLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      destructive: Boolean(options.destructive),
      initialFocus: options.initialFocus || 'cancel'
    });
    return result.submitted;
  }

  async function showMessage(options = {}) {
    await openDialog({
      ...options,
      mode: 'message',
      fields: [],
      showCancel: false,
      submitLabel: options.submitLabel || 'OK',
      destructive: false,
      initialFocus: 'submit'
    });
  }

  function openDialog(options) {
    if (activeRequest) {
      console.warn('Ignored an editor dialog request because another editor dialog is already open.');
      return Promise.resolve({ submitted: false, values: null, reason: 'busy' });
    }

    const invoker = resolveElement(options.invoker) || documentRef.activeElement;
    const returnFocus = options.returnFocus;
    const requestId = ++requestCounter;

    resetDialogState();
    dialog.dataset.dialogMode = options.mode || 'fields';
    dialog.classList.toggle('editor-dialog--destructive', Boolean(options.destructive));

    title.textContent = options.title || 'Continue';
    description.textContent = options.description || '';
    description.hidden = !options.description;
    if (options.description) dialog.setAttribute('aria-describedby', description.id);
    else dialog.removeAttribute('aria-describedby');

    cancelButton.textContent = options.cancelLabel || 'Cancel';
    cancelButton.hidden = options.showCancel === false;
    submitButton.textContent = options.submitLabel || 'Continue';
    submitButton.classList.toggle('editor-dialog-submit--danger', Boolean(options.destructive));

    const fieldRecords = (options.fields || []).map((field, index) => (
      createFieldRecord(field, index, requestId)
    ));

    return new Promise((resolve, reject) => {
      activeRequest = {
        resolve,
        reject,
        fields: fieldRecords,
        invoker,
        returnFocus
      };

      try {
        dialog.showModal();
      } catch (error) {
        activeRequest = null;
        reject(error);
        return;
      }

      queueMicrotask(() => focusInitialControl(fieldRecords, options.initialFocus));
    });
  }

  function createFieldRecord(field, index, requestId) {
    if (!field?.name) throw new Error('Every editor dialog field requires a name.');

    const wrapper = documentRef.createElement('div');
    wrapper.className = 'editor-dialog-field';

    const safeName = String(field.name).replace(/[^a-zA-Z0-9_-]+/g, '-');
    const controlId = `${id}-field-${requestId}-${index}-${safeName}`;
    const helpId = `${controlId}-help`;
    const errorId = `${controlId}-error`;

    const label = documentRef.createElement('label');
    label.htmlFor = controlId;
    label.className = 'editor-dialog-label';
    label.append(documentRef.createTextNode(field.label || field.name));
    if (field.required) {
      const requiredText = documentRef.createElement('span');
      requiredText.className = 'editor-dialog-required';
      requiredText.textContent = ' (required)';
      label.append(requiredText);
    }

    const control = createFieldControl(field, controlId);
    const describedBy = [];

    wrapper.append(label, control);

    if (field.helpText) {
      const help = documentRef.createElement('p');
      help.id = helpId;
      help.className = 'editor-dialog-help';
      help.textContent = field.helpText;
      wrapper.append(help);
      describedBy.push(helpId);
    }

    const error = documentRef.createElement('p');
    error.id = errorId;
    error.className = 'editor-dialog-field-error';
    error.hidden = true;
    error.setAttribute('role', 'alert');
    wrapper.append(error);
    describedBy.push(errorId);

    control.setAttribute('aria-describedby', describedBy.join(' '));
    control.setAttribute('aria-errormessage', errorId);

    const clear = () => clearFieldError({ control, error, wrapper });
    control.addEventListener('input', clear);
    control.addEventListener('change', clear);

    fieldsHost.append(wrapper);
    return { config: field, control, error, wrapper };
  }

  function createFieldControl(field, controlId) {
    let control;

    if (field.type === 'select') {
      control = documentRef.createElement('select');
      for (const optionValue of field.options || []) {
        const option = documentRef.createElement('option');
        if (typeof optionValue === 'object' && optionValue !== null) {
          option.value = String(optionValue.value ?? '');
          option.textContent = String(optionValue.label ?? optionValue.value ?? '');
          option.disabled = Boolean(optionValue.disabled);
        } else {
          option.value = String(optionValue);
          option.textContent = String(optionValue);
        }
        control.append(option);
      }
    } else if (field.type === 'textarea') {
      control = documentRef.createElement('textarea');
      if (field.rows) control.rows = field.rows;
    } else {
      control = documentRef.createElement('input');
      control.type = field.type || 'text';
    }

    control.id = controlId;
    control.name = field.name;
    control.value = String(field.value ?? '');
    control.required = Boolean(field.required);

    if (field.autocomplete !== undefined) control.autocomplete = field.autocomplete;
    if (field.inputMode) control.inputMode = field.inputMode;
    if (field.placeholder) control.placeholder = field.placeholder;
    if (field.min !== undefined) control.min = String(field.min);
    if (field.max !== undefined) control.max = String(field.max);
    if (field.step !== undefined) control.step = String(field.step);
    if (field.maxLength !== undefined) control.maxLength = Number(field.maxLength);

    return control;
  }

  function validateAndCollect(fieldRecords) {
    const values = {};

    for (const record of fieldRecords) {
      const { config, control } = record;
      let value = control.value;
      if (config.trim !== false && shouldTrim(control)) value = value.trim();
      values[config.name] = value;
    }

    let firstInvalid = null;

    for (const record of fieldRecords) {
      const { config, control } = record;
      const value = values[config.name];
      let errorMessage = '';

      if (config.required && value === '') {
        errorMessage = config.requiredMessage || `Enter ${String(config.label || config.name).toLowerCase()}.`;
      }

      if (!errorMessage && control.type === 'number' && value !== '') {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          errorMessage = config.numberMessage || 'Enter a valid number.';
        } else if (config.integer && !Number.isInteger(numericValue)) {
          errorMessage = config.integerMessage || 'Enter a whole number.';
        } else if (config.min !== undefined && numericValue < Number(config.min)) {
          errorMessage = config.minMessage || `Enter a value of ${config.min} or more.`;
        } else if (config.max !== undefined && numericValue > Number(config.max)) {
          errorMessage = config.maxMessage || `Enter a value of ${config.max} or less.`;
        }
      }

      if (!errorMessage && typeof config.validate === 'function') {
        errorMessage = config.validate(value, values, control) || '';
      }

      if (errorMessage) {
        showFieldError(record, errorMessage);
        if (!firstInvalid) firstInvalid = control;
        continue;
      }

      clearFieldError(record);
      if (typeof config.parse === 'function') values[config.name] = config.parse(value, values, control);
    }

    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: true });
      return null;
    }

    return values;
  }

  function finishRequest(result, { alreadyClosed = false } = {}) {
    const request = activeRequest;
    if (!request) return;
    activeRequest = null;

    if (!alreadyClosed && dialog.open) {
      pendingInternalCloseEvents += 1;
      dialog.close(result.submitted ? 'submitted' : 'cancelled');
    }

    restoreFocus(request);
    request.resolve(result);
  }

  function restoreFocus(request) {
    if (request.returnFocus === false) return;

    let target = null;
    if (typeof request.returnFocus === 'function') target = request.returnFocus();
    else target = resolveElement(request.returnFocus) || request.invoker;

    if (focusElement(target)) return;

    const containingDetails = request.invoker?.closest?.('details');
    if (containingDetails && focusElement(containingDetails.querySelector('summary'))) return;

    const fallback = documentRef.querySelector('#main');
    if (fallback && !fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
    focusElement(fallback);
  }

  function focusInitialControl(fieldRecords, initialFocus) {
    if (!dialog.open) return;

    let target = null;
    if (initialFocus === 'cancel' && !cancelButton.hidden) target = cancelButton;
    else if (initialFocus === 'submit') target = submitButton;
    else target = fieldRecords.find((record) => record.config.autofocus !== false)?.control;

    target ||= !cancelButton.hidden ? cancelButton : submitButton;
    target.focus({ preventScroll: true });

    const record = fieldRecords.find((candidate) => candidate.control === target);
    if (record?.config.select && typeof target.select === 'function') target.select();
  }

  function resetDialogState() {
    fieldsHost.replaceChildren();
    form.reset();
    dialog.removeAttribute('aria-describedby');
    dialog.classList.remove('editor-dialog--destructive');
    submitButton.classList.remove('editor-dialog-submit--danger');
    cancelButton.hidden = false;
  }

  const api = {
    requestFields,
    requestText,
    requestChoice,
    confirmAction,
    showMessage,
    get element() {
      return dialog;
    },
    get isOpen() {
      return dialog.open;
    }
  };

  Object.defineProperty(dialog, '__marinEditorDialogsApi', {
    value: api,
    configurable: false,
    enumerable: false,
    writable: false
  });

  return api;
}

function buildDialog(documentRef, id) {
  const dialog = documentRef.createElement('dialog');
  dialog.id = id;
  dialog.className = 'editor-dialog';
  dialog.setAttribute('aria-labelledby', `${id}-title`);

  const form = documentRef.createElement('form');
  form.className = 'editor-dialog-form';
  form.noValidate = true;
  form.setAttribute('data-editor-dialog-form', '');

  const header = documentRef.createElement('header');
  header.className = 'editor-dialog-header';

  const title = documentRef.createElement('h2');
  title.id = `${id}-title`;
  title.className = 'editor-dialog-title';
  title.setAttribute('data-editor-dialog-title', '');
  header.append(title);

  const description = documentRef.createElement('p');
  description.id = `${id}-description`;
  description.className = 'editor-dialog-description';
  description.hidden = true;
  description.setAttribute('data-editor-dialog-description', '');

  const fields = documentRef.createElement('div');
  fields.className = 'editor-dialog-fields';
  fields.setAttribute('data-editor-dialog-fields', '');

  const actions = documentRef.createElement('div');
  actions.className = 'editor-dialog-actions';

  const cancel = documentRef.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary outline editor-dialog-cancel';
  cancel.textContent = 'Cancel';
  cancel.setAttribute('data-editor-dialog-cancel', '');

  const submit = documentRef.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary editor-dialog-submit';
  submit.textContent = 'Continue';
  submit.setAttribute('data-editor-dialog-submit', '');

  actions.append(cancel, submit);
  form.append(header, description, fields, actions);
  dialog.append(form);
  return dialog;
}

function shouldTrim(control) {
  return control.tagName === 'TEXTAREA' ||
    control.tagName === 'SELECT' ||
    (control.tagName === 'INPUT' && TEXT_LIKE_INPUT_TYPES.has(control.type));
}

function showFieldError(record, message) {
  record.error.textContent = message;
  record.error.hidden = false;
  record.control.setAttribute('aria-invalid', 'true');
  record.control.setCustomValidity?.(message);
  record.wrapper.classList.add('editor-dialog-field--invalid');
}

function clearFieldError(record) {
  record.error.textContent = '';
  record.error.hidden = true;
  record.control.removeAttribute('aria-invalid');
  record.control.setCustomValidity?.('');
  record.wrapper.classList.remove('editor-dialog-field--invalid');
}

function resolveElement(value) {
  if (!value) return null;
  if (typeof value === 'function') return resolveElement(value());
  return typeof value.focus === 'function' ? value : null;
}

function focusElement(element) {
  if (!element?.isConnected || element.hidden || element.disabled) return false;
  if (element.closest?.('[hidden], [inert]')) return false;

  try {
    element.focus({ preventScroll: true });
    return element.ownerDocument?.activeElement === element;
  } catch {
    return false;
  }
}
