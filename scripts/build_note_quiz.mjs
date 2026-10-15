#!/usr/bin/env node
// Build (or rebuild) a package's quiz from a quiz source file. Writes the package in place.
//   node scripts/build_note_quiz.mjs packages/<name>.zip source/quizzes/<name>.json
// This also removes the earlier reading material, content blocks, objectives, and
// Markdown files, which nothing refers to once the quiz and deck point at the Note.
import { readFile, writeFile } from 'node:fs/promises';

import { applyNoteQuiz } from '../js/core/note-quiz.js';
import { importLearningPackage, packageEntries } from '../js/core/package.js';
import { createZip } from '../js/core/zip.js';
import { getObjects } from '../js/core/model.js';
import { uuid5 } from './build_note_deck.mjs';

export async function buildQuizForPackage(zipPath, sourcePath) {
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  const { pkg } = await importLearningPackage(new Uint8Array(await readFile(zipPath)), { allowInvalid: true });
  const [note] = getObjects(pkg, 'marin:Note');
  applyNoteQuiz(pkg.graphDocument, { source, makeId: (key) => uuid5(`marin-learn/quiz/${note['@id']}/${key}`) });
  pkg.contentFiles = {}; // the old Markdown files belonged to the removed content blocks
  const entries = [...packageEntries(pkg)].map(([name, data]) => ({ name, data }));
  await writeFile(zipPath, createZip(entries));
  return { questions: source.questions.length, name: source.name };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [zipPath, sourcePath] = process.argv.slice(2);
  if (!zipPath || !sourcePath) {
    console.error('Usage: node scripts/build_note_quiz.mjs packages/<name>.zip source/quizzes/<name>.json');
    process.exit(2);
  }
  const result = await buildQuizForPackage(zipPath, sourcePath);
  console.log(`${result.name}: ${result.questions} questions`);
}
