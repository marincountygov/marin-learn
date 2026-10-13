// Shared sequence helpers for editor drag-and-drop reordering.

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function orderedEntries(itemList) {
  return Array.from(itemList?.itemListElement || []).sort((a, b) => Number(a.position) - Number(b.position));
}

function renumber(entries) {
  return entries.map((entry, index) => ({ ...entry, position: index + 1 }));
}

export function snapshotItemList(itemList) {
  return cloneValue(itemList || { '@type': 'ItemList', itemListElement: [] });
}

export function restoreItemList(itemList, snapshot) {
  if (!itemList || !snapshot) return;
  for (const key of Object.keys(itemList)) delete itemList[key];
  Object.assign(itemList, cloneValue(snapshot));
}

export function transferItemAtIndex(
  sourceList,
  targetList,
  sourceIndex,
  targetIndex,
  expectedItemId = ''
) {
  if (!sourceList || !targetList) return { moved: false };

  const sourceEntries = orderedEntries(sourceList);
  const normalizedSourceIndex = Number(sourceIndex);
  if (!Number.isInteger(normalizedSourceIndex)
      || normalizedSourceIndex < 0
      || normalizedSourceIndex >= sourceEntries.length) {
    return { moved: false };
  }

  const entry = sourceEntries[normalizedSourceIndex];
  if (expectedItemId && entry.item?.['@id'] !== expectedItemId) return { moved: false };

  sourceEntries.splice(normalizedSourceIndex, 1);
  sourceList['@type'] ||= 'ItemList';
  sourceList.itemListElement = renumber(sourceEntries);

  const destinationEntries = sourceList === targetList
    ? sourceEntries
    : orderedEntries(targetList);
  const numericTargetIndex = Number(targetIndex);
  const destinationIndex = Math.max(
    0,
    Math.min(Number.isFinite(numericTargetIndex) ? numericTargetIndex : 0, destinationEntries.length)
  );
  destinationEntries.splice(destinationIndex, 0, entry);
  targetList['@type'] ||= 'ItemList';
  targetList.itemListElement = renumber(destinationEntries);

  return {
    moved: sourceList !== targetList || normalizedSourceIndex !== destinationIndex,
    sourceIndex: normalizedSourceIndex,
    targetIndex: destinationIndex,
    entry
  };
}

export function transferItemById(sourceList, targetList, itemId, targetIndex) {
  if (!sourceList || !targetList || !itemId) return { moved: false };
  const sourceIndex = orderedEntries(sourceList)
    .findIndex((entry) => entry.item?.['@id'] === itemId);
  return transferItemAtIndex(sourceList, targetList, sourceIndex, targetIndex, itemId);
}

export function moveItemAtIndex(itemList, sourceIndex, targetIndex, expectedItemId = '') {
  return transferItemAtIndex(itemList, itemList, sourceIndex, targetIndex, expectedItemId);
}

export function moveItemById(itemList, itemId, targetIndex) {
  return transferItemById(itemList, itemList, itemId, targetIndex);
}

export function itemIds(itemList) {
  return orderedEntries(itemList).map((entry) => entry.item?.['@id']).filter(Boolean);
}
