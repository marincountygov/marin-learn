import test from 'node:test';
import assert from 'node:assert/strict';

import {
  itemIds,
  moveItemAtIndex,
  moveItemById,
  restoreItemList,
  snapshotItemList,
  transferItemById
} from '../editor/assets/reorder.js';

function list(entries) {
  return {
    '@type': 'ItemList',
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: { '@id': entry.id },
      ...(entry.extra || {})
    }))
  };
}

test('same-list reordering preserves ListItem metadata and renumbers positions', () => {
  const sequence = list([
    { id: 'a', extra: { 'marin:weight': 2 } },
    { id: 'b', extra: { 'marin:weight': 5 } },
    { id: 'c', extra: { 'marin:weight': 8 } }
  ]);

  const result = moveItemById(sequence, 'c', 0);

  assert.equal(result.moved, true);
  assert.deepEqual(itemIds(sequence), ['c', 'a', 'b']);
  assert.deepEqual(sequence.itemListElement.map((entry) => entry.position), [1, 2, 3]);
  assert.equal(sequence.itemListElement[0]['marin:weight'], 8);
  assert.equal(sequence.itemListElement[1]['marin:weight'], 2);
});

test('cross-list transfer moves the original ListItem and updates both lists', () => {
  const source = list([
    { id: 'section-a' },
    { id: 'unit-a', extra: { 'marin:displayMode': 'abstract' } }
  ]);
  const target = list([{ id: 'unit-b' }]);

  const result = transferItemById(source, target, 'unit-a', 0);

  assert.equal(result.moved, true);
  assert.deepEqual(itemIds(source), ['section-a']);
  assert.deepEqual(itemIds(target), ['unit-a', 'unit-b']);
  assert.equal(target.itemListElement[0]['marin:displayMode'], 'abstract');
  assert.deepEqual(target.itemListElement.map((entry) => entry.position), [1, 2]);
});

test('snapshots restore the complete ItemList after a move', () => {
  const sequence = list([
    { id: 'one', extra: { custom: 'first' } },
    { id: 'two', extra: { custom: 'second' } }
  ]);
  const before = snapshotItemList(sequence);

  moveItemById(sequence, 'two', 0);
  sequence.itemListElement[0].custom = 'changed';
  restoreItemList(sequence, before);

  assert.deepEqual(itemIds(sequence), ['one', 'two']);
  assert.equal(sequence.itemListElement[0].custom, 'first');
  assert.equal(sequence.itemListElement[1].custom, 'second');
  assert.notEqual(sequence, before);
});

test('index-based moves distinguish repeated references by occurrence', () => {
  const sequence = list([
    { id: 'shared', extra: { occurrence: 'first' } },
    { id: 'shared', extra: { occurrence: 'second' } },
    { id: 'other', extra: { occurrence: 'third' } }
  ]);

  const result = moveItemAtIndex(sequence, 1, 0, 'shared');

  assert.equal(result.moved, true);
  assert.deepEqual(itemIds(sequence), ['shared', 'shared', 'other']);
  assert.deepEqual(sequence.itemListElement.map((entry) => entry.occurrence), [
    'second',
    'first',
    'third'
  ]);
});

test('moving an unknown item or dropping at the same logical position is a no-op', () => {
  const sequence = list([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

  assert.equal(moveItemById(sequence, 'missing', 0).moved, false);
  assert.equal(moveItemById(sequence, 'b', 1).moved, false);
  assert.deepEqual(itemIds(sequence), ['a', 'b', 'c']);
});
