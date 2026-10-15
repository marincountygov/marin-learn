#!/usr/bin/env node
// Check a learning package against every Marin Learn rule, including the Note, deck, and
// quiz rules. Prints each problem and exits 1 if there are errors.
//   node scripts/validate_package.mjs packages/<name>.zip
import { readFile } from 'node:fs/promises';

import { importLearningPackage } from '../js/core/package.js';
import { validatePackage } from '../js/core/validate.js';

export async function checkPackage(zipPath) {
  const { pkg } = await importLearningPackage(new Uint8Array(await readFile(zipPath)), { allowInvalid: true });
  return validatePackage(pkg);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/validate_package.mjs packages/<name>.zip');
    process.exit(2);
  }
  const result = await checkPackage(file);
  for (const entry of result.errors) console.log(`ERROR   ${entry.code}: ${entry.message}`);
  for (const entry of result.warnings) console.log(`WARNING ${entry.code}: ${entry.message}`);
  console.log(`${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  process.exit(result.errors.length ? 1 : 0);
}
