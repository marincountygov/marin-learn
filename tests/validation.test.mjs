import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createExamplePackage } from '../examples/example-package.js';
import {
  addToAssessment,
  createAssessmentItem,
  getObjects,
  rootLearningSet,
  syncRootMembership
} from '../js/core/model.js';
import { TYPES } from '../js/core/constants.js';
import { validatePackage } from '../js/core/validate.js';
import { MARIN_LEARN_SCHEMA } from '../js/core/schema-data.js';


test('the runtime schema stays synchronized with the canonical v1 schema', async () => {
  const canonical = JSON.parse(await readFile(new URL('../schema/marin-learn-v1.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(MARIN_LEARN_SCHEMA, canonical);
});

test('the reference learning package passes all validation stages without warnings', () => {
  const result = validatePackage(createExamplePackage());
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.valid, true);
});

test('schema validation accepts URL license values on creative works and assets', () => {
  const pkg = createExamplePackage();
  const licenseUrl = 'https://creativecommons.org/licenses/by/4.0/';
  rootLearningSet(pkg).license = licenseUrl;
  const image = getObjects(pkg, TYPES.IMAGE)[0];
  assert.ok(image, 'Reference package should include an image asset.');
  image.license = licenseUrl;

  const result = validatePackage(pkg);
  assert.equal(result.errors.length, 0, result.errors.map((item) => `${item.path || ''} ${item.message}`).join('\n'));
  assert.equal(result.valid, true);
});

test('schema validation rejects educational levels outside the v1 vocabulary', () => {
  const pkg = createExamplePackage();
  rootLearningSet(pkg).educationalLevel = 'expert';
  const result = validatePackage(pkg);
  assert.ok(result.errors.some((item) => item.stage === 'Schema'));
  assert.equal(result.valid, false);
});

test('semantic validation detects a broken object reference', () => {
  const pkg = createExamplePackage();
  const material = getObjects(pkg, TYPES.MATERIAL)[0];
  material['marin:contentSequence'].itemListElement[0].item['@id'] = 'urn:uuid:ffffffff-ffff-4fff-8fff-ffffffffffff';
  const result = validatePackage(pkg);
  assert.ok(result.errors.some((item) => item.code === 'unresolved-reference'));
});

test('multiple true/false questions can reuse stable true and false local identifiers', () => {
  const pkg = createExamplePackage();
  const quiz = getObjects(pkg, TYPES.ASSESSMENT)[0];
  const first = createAssessmentItem(pkg, 'true-false', 'First statement');
  const second = createAssessmentItem(pkg, 'true-false', 'Second statement');
  addToAssessment(quiz, first['@id']);
  addToAssessment(quiz, second['@id']);
  syncRootMembership(pkg);
  const result = validatePackage(pkg);
  const duplicateBooleanErrors = result.errors.filter((item) => item.code === 'duplicate-identifier' && /true|false/i.test(item.message));
  assert.equal(duplicateBooleanErrors.length, 0);
  const options = getObjects(pkg, TYPES.RESPONSE_OPTION).filter((option) => ['true', 'false'].includes(option.identifier));
  assert.ok(options.filter((option) => option.identifier === 'true').length >= 3);
  assert.ok(options.filter((option) => option.identifier === 'false').length >= 3);
});
