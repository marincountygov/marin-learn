// Marin Learn Authoring - Images and Files Module (Phase R5)
import { isSupportedImageType, sniffMediaType, validateAssetBytes } from '../../js/core/assets.js';
import { TYPES } from '../../js/core/constants.js';
import {
  createImageAsset,
  getObject,
  getObjects,
  hasType,
  removeGraphObject,
  structuralUsagesOf,
  touchPackage
} from '../../js/core/model.js';
import { escapeHtml, slugify } from '../../js/core/utils.js';

export function bytesToDataUri(bytes, type) {
  if (!bytes || !type) return '';
  try {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${type};base64,${btoa(binary)}`;
  } catch (e) {
    return '';
  }
}

export function createAssetsModule({ getPkg, persistWorkspace, showMessage, dialogs }) {
  function render(container) {
    if (!container) return;
    const pkg = getPkg();
    if (!pkg) return;

    const assets = getObjects(pkg, TYPES.IMAGE);
    if (!assets.length) {
      container.innerHTML = `
        <div class="editor-empty-state">
          <p class="text-muted editor-empty-notice">No images or files yet. Add an image when it helps explain the material.</p>
        </div>`;
      return;
    }

    const cardsHtml = assets.map((asset) => {
      const path = asset.contentUrl;
      const fileData = pkg.assetFiles[path];
      const bytes = fileData?.bytes;
      const sizeStr = bytes ? `${(bytes.length / 1024).toFixed(1)} KB` : 'Unknown size';
      const usages = structuralUsagesOf(pkg, asset['@id']);
      const usageList = usages.map((u) => escapeHtml(u.object.name || 'Resource')).join(', ');

      const thumbUrl = bytes && fileData.type ? bytesToDataUri(bytes, fileData.type) : '';

      return `
        <article class="editor-asset-card editor-item-card" data-asset-id="${escapeHtml(asset['@id'])}">
          <div class="editor-asset-preview-col">
            ${thumbUrl ? `<img src="${thumbUrl}" alt="${escapeHtml(asset.name)}" class="editor-asset-thumbnail">` : '<div class="editor-asset-no-thumb">No preview</div>'}
          </div>
          <div class="editor-asset-info-col">
            <div class="editor-block-badge-row">
              <span class="app-badge badge--level">${escapeHtml(asset.encodingFormat || 'Image')}</span>
              <span class="editor-weight-tag">${sizeStr}</span>
              <span class="editor-usage-tag">${usages.length} usage(s)</span>
            </div>
            <h5>${escapeHtml(asset.name || asset.identifier)}</h5>
            <p class="editor-asset-path text-muted"><code>${escapeHtml(path)}</code></p>
            ${asset.caption ? `<p class="editor-asset-caption">Caption: ${escapeHtml(asset.caption)}</p>` : ''}
            <div class="editor-asset-usages text-muted">
              <strong>Where used:</strong> ${usageList || 'Unused in reading materials or slides'}
            </div>
          </div>
          <div class="editor-item-actions">
            <button type="button" class="secondary outline btn-sm btn-edit-asset-meta" data-id="${escapeHtml(asset['@id'])}">Edit metadata</button>
            <button type="button" class="secondary outline btn-sm btn-remove btn-del-asset" data-id="${escapeHtml(asset['@id'])}">Delete</button>
          </div>
        </article>`;
    }).join('');

    container.innerHTML = `
      <div class="editor-assets-grid">
        ${cardsHtml}
      </div>`;

    bindAssetEvents(container);
  }

  function bindAssetEvents(container) {
    const pkg = getPkg();

    container.querySelectorAll('.btn-edit-asset-meta').forEach((btn) => {
      btn.addEventListener('click', () => {
        showEditMetadataModal(btn.dataset.id, container);
      });
    });

    container.querySelectorAll('.btn-del-asset').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const assetId = btn.dataset.id;
        const asset = getObject(pkg, assetId);
        if (!asset) return;

        const usages = structuralUsagesOf(pkg, assetId);
        let description;
        if (usages.length > 0) {
          const names = usages.map((u) => u.object.name || 'Resource').join(', ');
          description = `“${asset.name}” is used in ${usages.length} place(s):\n${names}\n\nDeleting it removes the asset file and leaves broken references in those places.`;
        } else {
          description = `Delete “${asset.name}” and its file permanently from this project?`;
        }

        const confirmed = await dialogs.confirmAction({
          title: 'Delete image?',
          description,
          submitLabel: 'Delete image',
          destructive: true
        });
        if (!confirmed) return;

        const assetIds = getObjects(pkg, TYPES.IMAGE).map((candidate) => candidate['@id']);
        const deletedIndex = assetIds.indexOf(assetId);
        const nextAssetId = assetIds[deletedIndex + 1] || assetIds[deletedIndex - 1] || null;

        removeGraphObject(pkg, assetId);
        touchPackage(pkg);
        await persistWorkspace();
        render(container);
        if (nextAssetId) {
          container.querySelector(`[data-asset-id="${CSS.escape(nextAssetId)}"] button`)?.focus();
        } else {
          document.getElementById('file-add-asset')?.parentElement?.focus();
        }
        showMessage(`Deleted asset "${asset.name}".`, 'success', { focus: false });
      });
    });
  }

  function showEditMetadataModal(assetId, container) {
    const pkg = getPkg();
    const asset = getObject(pkg, assetId);
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!asset || !modalHost) return;

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="asset-meta-title">
        <div class="editor-preview-content editor-settings-modal-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Asset Metadata</span>
              <h2 id="asset-meta-title">${escapeHtml(asset.name)} — Details</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close details">Close</button>
          </header>
          <div class="editor-modal-body">
            <div class="grid">
              <label>Display name
                <input type="text" id="asset-edit-name" value="${escapeHtml(asset.name || '')}">
              </label>
              <label>Identifier slug
                <input type="text" id="asset-edit-slug" value="${escapeHtml(asset.identifier || '')}">
              </label>
            </div>
            <label>Caption (optional visible text)
              <input type="text" id="asset-edit-caption" value="${escapeHtml(asset.caption || '')}" placeholder="Visible caption under image…">
            </label>
            <div class="grid">
              <label>Credit / Attribution (optional)
                <input type="text" id="asset-edit-credit" value="${escapeHtml(asset.creditText || '')}" placeholder="Author or photographer…">
              </label>
              <label>License (optional)
                <input type="text" id="asset-edit-license" value="${escapeHtml(asset.license || '')}" placeholder="e.g. Public Domain, CC-BY">
              </label>
            </div>
            <details class="editor-advanced-details">
              <summary>Technical Details</summary>
              <div class="editor-advanced-body">
                <p><strong>Asset ID:</strong> <code>${escapeHtml(asset['@id'])}</code></p>
                <p><strong>File Path:</strong> <code>${escapeHtml(asset.contentUrl)}</code></p>
                <p><strong>Media Format:</strong> <code>${escapeHtml(asset.encodingFormat)}</code></p>
                <pre class="editor-json-preview"><code>${escapeHtml(JSON.stringify(asset, null, 2))}</code></pre>
              </div>
            </details>
            <div class="editor-form-actions">
              <button type="button" id="btn-save-asset-meta" class="primary">Save metadata</button>
              <button type="button" class="secondary outline btn-close-modal">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector(`[data-asset-id="${CSS.escape(assetId)}"] button`)?.focus();
    };

    modalHost.querySelectorAll('.btn-close-modal').forEach((btn) => btn.addEventListener('click', closeModal));
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });

    modalHost.querySelector('#btn-save-asset-meta')?.addEventListener('click', async () => {
      const name = modalHost.querySelector('#asset-edit-name').value.trim();
      if (!name) {
        showMessage('Enter an asset display name.', 'error');
        return;
      }
      asset.name = name;
      asset.identifier = slugify(modalHost.querySelector('#asset-edit-slug').value.trim() || name, 'asset');
      asset.caption = modalHost.querySelector('#asset-edit-caption').value.trim() || undefined;
      asset.creditText = modalHost.querySelector('#asset-edit-credit').value.trim() || undefined;
      asset.license = modalHost.querySelector('#asset-edit-license').value.trim() || undefined;

      touchPackage(pkg);
      await persistWorkspace();
      closeModal();
      render(container);
      showMessage('Asset metadata updated.', 'success');
    });

    modalHost.querySelector('#asset-edit-name')?.focus();
  }

  return {
    render
  };
}

export function showImageInsertModal(container, { getPkg, persistWorkspace, showMessage, onInsert }) {
  const pkg = getPkg();
  const modalHost = document.getElementById('editor-modal-root') || container;
  if (!pkg || !modalHost) return;

  function renderAssetChoices(selectedAssetId = '') {
    const assets = getObjects(pkg, TYPES.IMAGE);
    if (!assets.length) {
      return '<p class="text-muted">No images currently in this project. Use the upload tab above to add one.</p>';
    }
    return assets.map((a, i) => {
      const fileData = pkg.assetFiles[a.contentUrl];
      const thumbUrl = fileData?.bytes && fileData.type ? bytesToDataUri(fileData.bytes, fileData.type) : '';
      const selected = selectedAssetId ? a['@id'] === selectedAssetId : i === 0;
      return `
        <label class="editor-image-choice-card">
          <input type="radio" name="selected-insert-asset" value="${escapeHtml(a['@id'])}" ${selected ? 'checked' : ''}>
          ${thumbUrl ? `<img src="${thumbUrl}" alt="${escapeHtml(a.name)}" class="editor-choice-thumb">` : ''}
          <div class="editor-choice-meta">
            <strong>${escapeHtml(a.name)}</strong>
            <span class="text-muted">${escapeHtml(a.contentUrl)}</span>
          </div>
        </label>`;
    }).join('');
  }

  modalHost.innerHTML = `
    <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="insert-img-title">
      <div class="editor-preview-content editor-insert-img-modal-content">
        <header class="editor-preview-header">
          <div>
            <span class="app-badge badge--level">Insert Image</span>
            <h2 id="insert-img-title">Add Image to Content</h2>
          </div>
          <button type="button" class="secondary outline btn-close-modal" aria-label="Cancel">Close</button>
        </header>
        <div class="editor-modal-body">
          <div id="insert-img-error" class="app-alert app-alert--danger editor-hidden editor-modal-inline-error" role="alert" tabindex="-1"></div>
          <div class="editor-insert-img-tabs">
            <h4>Select an existing image</h4>
            <div class="editor-img-choices-list">
              ${renderAssetChoices()}
            </div>
            <div class="editor-new-upload-box">
              <label class="secondary outline btn-sm editor-file-btn-label" role="button" tabindex="0">
                + Upload new image file
                <input type="file" id="modal-upload-new-asset" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" class="editor-hidden">
              </label>
            </div>
          </div>

          <div class="editor-alt-text-group">
            <label class="editor-label">
              Image description (alternative text) *
              <input type="text" id="insert-img-alt" aria-describedby="insert-img-help insert-img-alt-error" aria-errormessage="insert-img-alt-error" placeholder="Describe what the image communicates for someone who cannot see it…">
            </label>
            <p id="insert-img-alt-error" class="editor-dialog-field-error editor-hidden" role="alert"></p>
            <label class="editor-checkbox-label">
              <input type="checkbox" id="insert-img-decorative">
              <span>This image is decorative (does not convey essential instructional information)</span>
            </label>
            <p id="insert-img-help" class="editor-help-text text-muted">Meaningful images require an accessible description. If marked decorative, description is omitted.</p>
          </div>

          <div class="editor-form-actions">
            <button type="button" id="btn-confirm-insert-img" class="primary">Insert image</button>
            <button type="button" class="secondary outline btn-close-modal">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;

  const closeModal = () => {
    modalHost.innerHTML = '';
  };

  modalHost.querySelectorAll('.btn-close-modal').forEach((btn) => btn.addEventListener('click', closeModal));
  modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('editor-preview-modal')) closeModal();
  });

  const decorativeCheckbox = modalHost.querySelector('#insert-img-decorative');
  const altInput = modalHost.querySelector('#insert-img-alt');
  const errorRegion = modalHost.querySelector('#insert-img-error');
  const altError = modalHost.querySelector('#insert-img-alt-error');
  const uploadLabel = modalHost.querySelector('.editor-file-btn-label');

  const clearInsertError = () => {
    if (errorRegion) {
      errorRegion.textContent = '';
      errorRegion.classList.add('editor-hidden');
    }
    if (altError) {
      altError.textContent = '';
      altError.classList.add('editor-hidden');
    }
    altInput?.removeAttribute('aria-invalid');
  };

  const showInsertError = (message, focusTarget, { invalidAlt = false } = {}) => {
    clearInsertError();
    const targetRegion = invalidAlt ? altError : errorRegion;
    if (targetRegion) {
      targetRegion.textContent = message;
      targetRegion.classList.remove('editor-hidden');
    }
    if (invalidAlt) altInput?.setAttribute('aria-invalid', 'true');
    (focusTarget || targetRegion)?.focus();
  };

  decorativeCheckbox?.addEventListener('change', () => {
    clearInsertError();
    if (decorativeCheckbox.checked) {
      altInput.disabled = true;
      altInput.value = '';
    } else {
      altInput.disabled = false;
    }
  });
  altInput?.addEventListener('input', clearInsertError);
  modalHost.querySelector('.editor-img-choices-list')?.addEventListener('change', clearInsertError);

  modalHost.querySelector('#modal-upload-new-asset')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    clearInsertError();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detectedType = sniffMediaType(bytes);
      if (!isSupportedImageType(detectedType)) throw new Error('Unsupported image format.');
      const issues = validateAssetBytes(bytes, detectedType, file.name);
      const errors = issues.filter((i) => i.severity === 'error');
      if (errors.length) throw new Error(errors.map((i) => i.message).join(' '));

      const newAsset = createImageAsset(pkg, { name: file.name, type: detectedType, bytes });
      touchPackage(pkg);
      await persistWorkspace();

      // Refresh choices
      modalHost.querySelector('.editor-img-choices-list').innerHTML = renderAssetChoices(newAsset['@id']);
      showMessage(`Uploaded "${newAsset.name}".`, 'success', { focus: false });
    } catch (err) {
      showInsertError(`The image could not be added. ${err.message}`, uploadLabel);
    } finally {
      event.target.value = '';
    }
  });

  modalHost.querySelector('#btn-confirm-insert-img')?.addEventListener('click', () => {
    const isDecorative = decorativeCheckbox?.checked;
    const altText = altInput?.value.trim();

    if (!isDecorative && !altText) {
      showInsertError('Enter an image description, or mark the image as decorative.', altInput, { invalidAlt: true });
      return;
    }

    const selectedRadio = modalHost.querySelector('input[name="selected-insert-asset"]:checked');
    if (!selectedRadio) {
      const firstChoice = modalHost.querySelector('input[name="selected-insert-asset"]');
      showInsertError('Select an image to insert, or upload a new image.', firstChoice || uploadLabel);
      return;
    }

    const assetId = selectedRadio.value;
    const asset = getObject(pkg, assetId);
    if (!asset) return;

    const uuid = assetId.replace(/^urn:uuid:/i, '');
    const fileData = pkg.assetFiles[asset.contentUrl];
    const srcUrl = fileData?.bytes && fileData.type ? bytesToDataUri(fileData.bytes, fileData.type) : '';

    closeModal();
    onInsert?.({
      assetUuid: uuid,
      alt: isDecorative ? '' : altText,
      src: srcUrl
    });
  });

  altInput?.focus();
}
