/**
 * Marin Sortable 0.1.0
 *
 * Small, dependency-free pointer sorting helper for MarinOS applications.
 * It deliberately does not provide keyboard reordering. Consumers must keep
 * explicit keyboard-operable move controls alongside drag handles.
 *
 * Covered by the repository's MIT license.
 */

const DEFAULTS = {
  listSelector: '[data-sortable-list]',
  itemSelector: '[data-sortable-item]',
  handleSelector: '[data-sortable-handle]',
  emptyNoticeSelector: '[data-sortable-empty-notice]',
  dragThreshold: 6,
  autoScrollMargin: 88,
  autoScrollMaxSpeed: 18,
  ghostClass: 'editor-drag-ghost',
  sourceClass: 'editor-drag-source',
  placeholderClass: 'editor-drag-placeholder',
  targetClass: 'editor-drag-target'
};

function directItems(list, itemSelector, excluded = null) {
  return Array.from(list?.children || []).filter((child) => (
    child !== excluded && child.matches?.(itemSelector)
  ));
}

function elementDepth(element) {
  let depth = 0;
  let current = element;
  while (current?.parentElement) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function removeDuplicateIds(root) {
  if (root.id) root.removeAttribute('id');
  root.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  root.querySelectorAll('button, input, select, textarea, a, [tabindex]').forEach((element) => {
    element.setAttribute('tabindex', '-1');
  });
}

function closestWithin(element, selector, root) {
  const match = element?.closest?.(selector);
  return match && root.contains(match) ? match : null;
}

function listCandidatesAtPoint(root, x, y, listSelector) {
  const candidates = [];
  const seen = new Set();

  for (const element of document.elementsFromPoint(x, y)) {
    let list = closestWithin(element, listSelector, root);
    while (list && !seen.has(list)) {
      seen.add(list);
      candidates.push(list);
      const parent = list.parentElement;
      list = parent ? closestWithin(parent, listSelector, root) : null;
    }
  }

  if (!candidates.length) {
    root.querySelectorAll(listSelector).forEach((list) => {
      const rect = list.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        candidates.push(list);
      }
    });
  }

  return candidates.sort((a, b) => elementDepth(b) - elementDepth(a));
}

function insertionForPoint(list, y, options, sourceItem) {
  const children = directItems(list, options.itemSelector, sourceItem);
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const rect = options.getItemDropRect?.(child, list) || child.getBoundingClientRect();
    if (y < rect.top + (rect.height / 2)) {
      return { index, before: child, children };
    }
  }
  return { index: children.length, before: null, children };
}

function normalizeDropDecision(decision) {
  if (decision === false) return { allowed: false };
  if (decision === true || decision == null) return { allowed: true };
  return { allowed: decision.allowed !== false, ...decision };
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Create a pointer/touch sortable region.
 *
 * @param {Element} root Region containing the sortable lists.
 * @param {Object} config Selectors and callbacks.
 * @returns {{destroy: Function, cancel: Function}}
 */
export function createPointerSortable(root, config = {}) {
  if (!(root instanceof Element)) {
    return { destroy() {}, cancel() {} };
  }

  const options = { ...DEFAULTS, ...config };
  const abortController = new AbortController();
  const { signal } = abortController;

  let candidate = null;
  let drag = null;
  let suppressClickUntil = 0;
  let autoScrollFrame = 0;
  let destroyed = false;

  function itemId(item) {
    if (!item) return '';
    return options.getItemId?.(item) || item.dataset.sortItemId || '';
  }

  function containerId(list) {
    if (!list) return '';
    return options.getContainerId?.(list) || list.dataset.sortContainerId || '';
  }

  function sourceIndexFor(item, list) {
    return directItems(list, options.itemSelector).indexOf(item);
  }

  function clearTargetState() {
    root.querySelectorAll(`.${options.targetClass}`).forEach((element) => {
      element.classList.remove(options.targetClass);
      element.removeAttribute('data-drop-label');
    });
  }

  function makeGhost(item, rect) {
    const ghost = item.cloneNode(true);
    removeDuplicateIds(ghost);
    ghost.classList.add(options.ghostClass);
    ghost.classList.remove(options.sourceClass);
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${rect.width}px`;
    ghost.style.maxHeight = `${Math.max(72, window.innerHeight * 0.4)}px`;
    if (prefersReducedMotion()) ghost.style.transition = 'none';
    document.body.append(ghost);
    return ghost;
  }

  function makePlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = options.placeholderClass;
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.setAttribute('role', 'presentation');
    return placeholder;
  }

  function updateGhostPosition(x, y) {
    if (!drag?.ghost) return;
    const left = x - drag.pointerOffsetX;
    const top = y - drag.pointerOffsetY;
    drag.ghost.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  function restorePlaceholderToSource() {
    if (!drag?.placeholder || !drag.sourceList) return;
    const siblings = directItems(drag.sourceList, options.itemSelector, drag.item);
    const before = siblings[drag.sourceIndex] || null;
    drag.sourceList.insertBefore(drag.placeholder, before || drag.sourceList.querySelector(options.emptyNoticeSelector) || null);
    drag.placeholder.classList.add(`${options.placeholderClass}--invalid`);
    drag.placeholder.dataset.dropLabel = 'Cannot move here';
  }

  function setDropTarget(list, insertion, decision) {
    clearTargetState();
    drag.placeholder.classList.remove(`${options.placeholderClass}--invalid`);

    const emptyNotice = list.querySelector(options.emptyNoticeSelector);
    if (insertion.before) {
      list.insertBefore(drag.placeholder, insertion.before);
    } else if (emptyNotice && emptyNotice.parentElement === list) {
      list.insertBefore(drag.placeholder, emptyNotice);
    } else {
      list.append(drag.placeholder);
    }

    const label = decision.label || options.getDropLabel?.({
      itemId: drag.itemId,
      itemElement: drag.item,
      sourceList: drag.sourceList,
      sourceContainerId: drag.sourceContainerId,
      targetList: list,
      targetContainerId: containerId(list),
      targetIndex: insertion.index
    }) || 'Move here';

    drag.placeholder.dataset.dropLabel = label;
    list.classList.add(options.targetClass);
    list.dataset.dropLabel = label;
    drag.targetList = list;
    drag.targetContainerId = containerId(list);
    drag.targetIndex = insertion.index;
    drag.valid = true;
  }

  function updateDropTarget(x, y) {
    if (!drag) return;
    drag.lastX = x;
    drag.lastY = y;

    const candidates = listCandidatesAtPoint(root, x, y, options.listSelector);
    for (const list of candidates) {
      const insertion = insertionForPoint(list, y, options, drag.item);
      const context = {
        itemId: drag.itemId,
        itemElement: drag.item,
        sourceList: drag.sourceList,
        sourceContainerId: drag.sourceContainerId,
        sourceIndex: drag.sourceIndex,
        targetList: list,
        targetContainerId: containerId(list),
        targetIndex: insertion.index
      };
      const decision = normalizeDropDecision(options.canDrop?.(context));
      if (decision.allowed) {
        setDropTarget(list, insertion, decision);
        return;
      }
    }

    clearTargetState();
    drag.valid = false;
    drag.targetList = null;
    drag.targetContainerId = '';
    drag.targetIndex = -1;
    restorePlaceholderToSource();
  }

  function autoScrollTick() {
    if (!drag || destroyed) return;
    const y = drag.lastY;
    const margin = options.autoScrollMargin;
    let speed = 0;

    if (y < margin) {
      speed = -Math.ceil(options.autoScrollMaxSpeed * (1 - Math.max(0, y) / margin));
    } else if (y > window.innerHeight - margin) {
      speed = Math.ceil(options.autoScrollMaxSpeed * (1 - Math.max(0, window.innerHeight - y) / margin));
    }

    if (speed !== 0) {
      window.scrollBy(0, speed);
      updateDropTarget(drag.lastX, drag.lastY);
    }
    autoScrollFrame = window.requestAnimationFrame(autoScrollTick);
  }

  function startDrag(event) {
    if (!candidate || drag) return;
    const rect = candidate.item.getBoundingClientRect();
    const placeholder = makePlaceholder();
    candidate.item.before(placeholder);

    drag = {
      ...candidate,
      itemId: itemId(candidate.item),
      sourceContainerId: containerId(candidate.sourceList),
      pointerOffsetX: candidate.startX - rect.left,
      pointerOffsetY: candidate.startY - rect.top,
      ghost: makeGhost(candidate.item, rect),
      placeholder,
      targetList: candidate.sourceList,
      targetContainerId: containerId(candidate.sourceList),
      targetIndex: candidate.sourceIndex,
      valid: true,
      lastX: event.clientX,
      lastY: event.clientY
    };

    candidate.item.classList.add(options.sourceClass);
    candidate.item.style.display = 'none';
    document.body.classList.add('editor-is-dragging');
    clearTargetState();
    updateGhostPosition(event.clientX, event.clientY);
    updateDropTarget(event.clientX, event.clientY);
    options.onStart?.({
      itemId: drag.itemId,
      itemElement: drag.item,
      sourceList: drag.sourceList,
      sourceContainerId: drag.sourceContainerId,
      sourceIndex: drag.sourceIndex
    });
    autoScrollFrame = window.requestAnimationFrame(autoScrollTick);
  }

  function stopAutoScroll() {
    if (autoScrollFrame) window.cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = 0;
  }

  function cleanDragVisuals({ keepDomPosition = false } = {}) {
    stopAutoScroll();
    clearTargetState();
    document.body.classList.remove('editor-is-dragging');

    if (!drag) return;
    const { item, ghost, placeholder, sourceList, sourceIndex } = drag;

    if (keepDomPosition && placeholder?.isConnected) {
      placeholder.parentElement.insertBefore(item, placeholder);
    } else if (item.parentElement !== sourceList) {
      const siblings = directItems(sourceList, options.itemSelector, item);
      sourceList.insertBefore(item, siblings[sourceIndex] || sourceList.querySelector(options.emptyNoticeSelector) || null);
    }

    item.style.removeProperty('display');
    item.classList.remove(options.sourceClass);
    ghost?.remove();
    placeholder?.remove();
  }

  function releasePointer() {
    if (candidate?.handle?.hasPointerCapture?.(candidate.pointerId)) {
      try {
        candidate.handle.releasePointerCapture(candidate.pointerId);
      } catch (_error) {
        // The browser may already have released pointer capture.
      }
    }
    candidate = null;
  }

  function cancel(reason = 'cancelled') {
    if (!drag) {
      releasePointer();
      return;
    }
    const payload = {
      itemId: drag.itemId,
      sourceContainerId: drag.sourceContainerId,
      sourceIndex: drag.sourceIndex,
      reason
    };
    cleanDragVisuals({ keepDomPosition: false });
    drag = null;
    releasePointer();
    options.onCancel?.(payload);
  }

  function isNoOpDrop() {
    return drag.sourceList === drag.targetList && drag.sourceIndex === drag.targetIndex;
  }

  function finishDrop() {
    if (!drag || !drag.valid || !drag.targetList) {
      cancel('invalid');
      return;
    }

    const payload = {
      itemId: drag.itemId,
      itemElement: drag.item,
      sourceList: drag.sourceList,
      sourceContainerId: drag.sourceContainerId,
      sourceIndex: drag.sourceIndex,
      targetList: drag.targetList,
      targetContainerId: drag.targetContainerId,
      targetIndex: drag.targetIndex,
      noOp: isNoOpDrop()
    };

    cleanDragVisuals({ keepDomPosition: true });
    suppressClickUntil = Date.now() + 500;
    drag = null;
    releasePointer();

    if (payload.noOp) {
      options.onCancel?.({ ...payload, reason: 'no-op' });
      return;
    }

    Promise.resolve(options.onDrop?.(payload)).catch((error) => {
      console.error('Sortable drop handler failed:', error);
      options.onError?.(error, payload);
    });
  }

  function onPointerDown(event) {
    if (destroyed || event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const handle = closestWithin(event.target, options.handleSelector, root);
    if (!handle || handle.matches('[disabled], [aria-disabled="true"]')) return;

    const item = closestWithin(handle, options.itemSelector, root);
    const sourceList = item ? closestWithin(item.parentElement, options.listSelector, root) : null;
    if (!item || !sourceList || item.classList.contains('is-editing')) return;

    const sourceIndex = sourceIndexFor(item, sourceList);
    if (sourceIndex < 0) return;

    candidate = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      handle,
      item,
      sourceList,
      sourceIndex,
      startX: event.clientX,
      startY: event.clientY
    };

    handle.focus({ preventScroll: true });
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch (_error) {
      // Pointer capture is an enhancement, not a requirement.
    }
  }

  function onPointerMove(event) {
    if (!candidate || event.pointerId !== candidate.pointerId) return;
    const dx = event.clientX - candidate.startX;
    const dy = event.clientY - candidate.startY;
    if (!drag && Math.hypot(dx, dy) < options.dragThreshold) return;

    event.preventDefault();
    if (!drag) startDrag(event);
    if (!drag) return;
    updateGhostPosition(event.clientX, event.clientY);
    updateDropTarget(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (!candidate || event.pointerId !== candidate.pointerId) return;
    if (drag) {
      event.preventDefault();
      finishDrop();
    } else {
      releasePointer();
    }
  }

  function onPointerCancel(event) {
    if (!candidate || event.pointerId !== candidate.pointerId) return;
    cancel('pointer-cancel');
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && drag) {
      event.preventDefault();
      cancel('escape');
    }
  }

  function onClick(event) {
    const handle = closestWithin(event.target, options.handleSelector, root);
    if (!handle) return;
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    options.onHandleActivate?.({
      itemId: itemId(closestWithin(handle, options.itemSelector, root)),
      handle
    });
  }

  root.addEventListener('pointerdown', onPointerDown, { signal });
  window.addEventListener('pointermove', onPointerMove, { passive: false, signal });
  window.addEventListener('pointerup', onPointerUp, { signal });
  window.addEventListener('pointercancel', onPointerCancel, { signal });
  document.addEventListener('keydown', onKeyDown, { signal });
  root.addEventListener('click', onClick, { capture: true, signal });

  return {
    cancel,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel('destroy');
      abortController.abort();
      stopAutoScroll();
    }
  };
}
