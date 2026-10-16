#!/usr/bin/env node
// Build (or rebuild) a package's slide deck from its Note. Writes the package in place.
//   node scripts/build_note_deck.mjs packages/<name>.zip [--budget 45] [--abstract "text"]
// The deck's slides point at the Note's sections, so run this again after the Note changes.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { applyNoteDeck } from '../js/core/note-deck.js';
import { importLearningPackage, packageEntries } from '../js/core/package.js';
import { createZip } from '../js/core/zip.js';
import { getObjects } from '../js/core/model.js';

// A version 5 UUID, so the same Note always gets the same slide IDs.
const NAMESPACE = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
export function uuid5(name) {
  const hash = createHash('sha1').update(NAMESPACE).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function buildDeckForPackage(zipPath, { budget = 45, abstract } = {}) {
  const { pkg } = await importLearningPackage(new Uint8Array(await readFile(zipPath)), { allowInvalid: true });
  const [note] = getObjects(pkg, 'marin:Note');
  const [deck] = getObjects(pkg, 'marin:Presentation');
  if (!note || !deck) throw new Error('The package needs one Note and one set of slides.');
  const slides = applyNoteDeck(pkg.graphDocument, {
    noteId: note['@id'],
    presentationId: deck['@id'],
    abstract,
    name: `${note.name} — slides`,
    makeId: (key) => uuid5(`marin-learn/deck/${note['@id']}/${key}`),
    options: { wordBudget: budget }
  });
  const entries = [...packageEntries(pkg)].map(([name, data]) => ({ name, data }));
  await writeFile(zipPath, createZip(entries));
  return { slides: slides.map((slide) => slide.name), note: note.name };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
  if (!file) {
    console.error('Usage: node scripts/build_note_deck.mjs packages/<name>.zip [--budget 45] [--abstract "text"]');
    process.exit(2);
  }
  const result = await buildDeckForPackage(file, { budget: Number(option('--budget') || 45), abstract: option('--abstract') });
  console.log(`${result.note}: ${result.slides.length} slides`);
  result.slides.forEach((name, index) => console.log(`  ${String(index + 1).padStart(2)}. ${name}`));
}
