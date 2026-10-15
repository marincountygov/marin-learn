#!/usr/bin/env python3
"""Automated regression test suite for Phase R2a (Sequencing, Sections, Depth, and Integrity)."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import serve
from playwright.sync_api import sync_playwright

class TestMaterialsR2a(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def eval_js(self, script: str):
        with serve() as base_url:
            context = self.browser.new_context()
            page = context.new_page()
            page.goto(f"{base_url}editor/", wait_until="networkidle")
            result = page.evaluate(script)
            context.close()
            return result

    def test_sequence_reordering_and_renumbering(self):
        result = self.eval_js("""async () => {
            const { emptyItemList, appendSequenceItem, moveSequenceItem } = await import('/js/core/model.js');
            const list = emptyItemList();
            appendSequenceItem(list, 'urn:uuid:1', { 'marin:weight': 5 });
            appendSequenceItem(list, 'urn:uuid:2', { 'marin:weight': 10 });
            appendSequenceItem(list, 'urn:uuid:3', { 'marin:weight': 15 });

            // Move item 0 down (+1) -> swaps with item 1
            const movedDown = moveSequenceItem(list, 0, 1);
            const orderAfterDown = list.itemListElement.map(e => ({ id: e.item['@id'], pos: e.position, weight: e['marin:weight'] }));

            // Move item 1 up (-1) -> restores order
            const movedUp = moveSequenceItem(list, 1, -1);
            const orderAfterUp = list.itemListElement.map(e => ({ id: e.item['@id'], pos: e.position, weight: e['marin:weight'] }));

            // Boundary checks
            const invalidUp = moveSequenceItem(list, 0, -1);
            const invalidDown = moveSequenceItem(list, 2, 1);

            return { movedDown, orderAfterDown, movedUp, orderAfterUp, invalidUp, invalidDown };
        }""")

        self.assertTrue(result['movedDown'])
        self.assertEqual(result['orderAfterDown'], [
            {'id': 'urn:uuid:2', 'pos': 1, 'weight': 10},
            {'id': 'urn:uuid:1', 'pos': 2, 'weight': 5},
            {'id': 'urn:uuid:3', 'pos': 3, 'weight': 15}
        ])
        self.assertTrue(result['movedUp'])
        self.assertEqual(result['orderAfterUp'], [
            {'id': 'urn:uuid:1', 'pos': 1, 'weight': 5},
            {'id': 'urn:uuid:2', 'pos': 2, 'weight': 10},
            {'id': 'urn:uuid:3', 'pos': 3, 'weight': 15}
        ])
        self.assertFalse(result['invalidUp'])
        self.assertFalse(result['invalidDown'])

    def test_positional_insertion(self):
        result = self.eval_js("""async () => {
            const { emptyItemList, appendSequenceItem, insertSequenceItem } = await import('/js/core/model.js');
            const list = emptyItemList();
            appendSequenceItem(list, 'urn:uuid:A');
            appendSequenceItem(list, 'urn:uuid:C');

            // Insert at index 1 (middle)
            insertSequenceItem(list, 1, 'urn:uuid:B');
            const middle = list.itemListElement.map(e => ({ id: e.item['@id'], pos: e.position }));

            // Insert at index 0 (beginning)
            insertSequenceItem(list, 0, 'urn:uuid:First');
            const beginning = list.itemListElement.map(e => ({ id: e.item['@id'], pos: e.position }));

            // Insert at end
            insertSequenceItem(list, 4, 'urn:uuid:Last');
            const end = list.itemListElement.map(e => ({ id: e.item['@id'], pos: e.position }));

            return { middle, beginning, end };
        }""")

        self.assertEqual(result['middle'], [
            {'id': 'urn:uuid:A', 'pos': 1},
            {'id': 'urn:uuid:B', 'pos': 2},
            {'id': 'urn:uuid:C', 'pos': 3}
        ])
        self.assertEqual(result['beginning'], [
            {'id': 'urn:uuid:First', 'pos': 1},
            {'id': 'urn:uuid:A', 'pos': 2},
            {'id': 'urn:uuid:B', 'pos': 3},
            {'id': 'urn:uuid:C', 'pos': 4}
        ])
        self.assertEqual(result['end'], [
            {'id': 'urn:uuid:First', 'pos': 1},
            {'id': 'urn:uuid:A', 'pos': 2},
            {'id': 'urn:uuid:B', 'pos': 3},
            {'id': 'urn:uuid:C', 'pos': 4},
            {'id': 'urn:uuid:Last', 'pos': 5}
        ])

    def test_section_nesting_depth_validation(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createMaterial, createSection, appendSequenceItem } = await import('/js/core/model.js');
            const { validatePackage } = await import('/js/core/validate.js');

            const pkg = createEmptyPackage('Depth Fixture');
            const mat = createMaterial(pkg, 'Material 1');

            const sec1 = createSection(pkg, 'Level 1 Section');
            const sec2 = createSection(pkg, 'Level 2 Section');
            const sec3 = createSection(pkg, 'Level 3 Section');
            const sec4 = createSection(pkg, 'Level 4 Section');

            appendSequenceItem(mat['marin:contentSequence'], sec1['@id']);
            appendSequenceItem(sec1['marin:contentSequence'], sec2['@id']);
            appendSequenceItem(sec2['marin:contentSequence'], sec3['@id']);

            // Depth 1, 2, 3 should be valid
            const val3 = validatePackage(pkg);
            const depthErrors3 = val3.errors.filter(e => e.code === 'section-depth');

            // Add Level 4 section -> depth 4 should be rejected
            appendSequenceItem(sec3['marin:contentSequence'], sec4['@id']);
            const val4 = validatePackage(pkg);
            const depthErrors4 = val4.errors.filter(e => e.code === 'section-depth');

            return {
                errorsCountAtDepth3: depthErrors3.length,
                errorsCountAtDepth4: depthErrors4.length,
                error4Message: depthErrors4[0]?.message
            };
        }""")

        self.assertEqual(result['errorsCountAtDepth3'], 0)
        self.assertEqual(result['errorsCountAtDepth4'], 1)
        self.assertIn("exceeds the maximum rendered section depth of 3", result['error4Message'])

    def test_cycle_prevention(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createMaterial, createSection, appendSequenceItem, canNestSection } = await import('/js/core/model.js');
            const { validatePackage } = await import('/js/core/validate.js');

            const pkg = createEmptyPackage('Cycle Fixture');
            const mat = createMaterial(pkg, 'Material');
            const secA = createSection(pkg, 'Section A');
            const secB = createSection(pkg, 'Section B');

            appendSequenceItem(mat['marin:contentSequence'], secA['@id']);
            appendSequenceItem(secA['marin:contentSequence'], secB['@id']);

            // Can Section A nest into Section B? (B is child of A -> should be False)
            const canNestChild = canNestSection(pkg, mat, secA['@id'], secB['@id']);
            // Can Section A nest into Section A? (Self -> should be False)
            const canNestSelf = canNestSection(pkg, mat, secA['@id'], secA['@id']);

            // Force cycle in graph and check validatePackage reports section-cycle and doesn't loop
            appendSequenceItem(secB['marin:contentSequence'], secA['@id']);
            const val = validatePackage(pkg);
            const cycleErrors = val.errors.filter(e => e.code === 'section-cycle');

            return { canNestChild, canNestSelf, cycleErrorsCount: cycleErrors.length };
        }""")

        self.assertFalse(result['canNestChild'])
        self.assertFalse(result['canNestSelf'])
        self.assertEqual(result['cycleErrorsCount'], 1)

    def test_transfer_content_between_sections(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createMaterial, createSection, createContentUnit, appendSequenceItem, transferSequenceItem } = await import('/js/core/model.js');

            const pkg = createEmptyPackage('Transfer Fixture');
            const mat = createMaterial(pkg, 'Material');
            const sec = createSection(pkg, 'Section 1');
            const unit = createContentUnit(pkg, 'Topic 1', 'topic');

            appendSequenceItem(mat['marin:contentSequence'], sec['@id']);
            appendSequenceItem(sec['marin:contentSequence'], unit['@id']);

            // Unit is inside Section 1 (pos 1). Move unit out of Section 1 to Material at index 1
            const movedOut = transferSequenceItem(sec['marin:contentSequence'], mat['marin:contentSequence'], 0, 1);

            const matList = mat['marin:contentSequence'].itemListElement.map(e => ({ id: e.item['@id'], pos: e.position }));
            const secList = sec['marin:contentSequence'].itemListElement.map(e => ({ id: e.item['@id'], pos: e.position }));

            return { movedOut: !!movedOut, matList, secList };
        }""")

        self.assertTrue(result['movedOut'])
        self.assertEqual(len(result['secList']), 0)
        self.assertEqual(len(result['matList']), 2)
        self.assertEqual(result['matList'][0]['pos'], 1)
        self.assertEqual(result['matList'][1]['pos'], 2)

    def test_import_reference_packages(self):
        result = self.eval_js("""async () => {
            const { importLearningPackage } = await import('/js/core/package.js');
            const packages = [['tests/fixtures/reference-package/marinos-foundations.zip', 'marin:LearningMaterial'], ['packages/county-leaders-guide-to-data.zip', 'marin:Note'], ['packages/county-leaders-guide-to-schemas.zip', 'marin:Note']];
            const results = {};
            for (const [name, type] of packages) {
                const resp = await fetch(`/${name}`);
                const buf = await resp.arrayBuffer();
                const res = await importLearningPackage(buf);
                results[name] = {
                    valid: res.validation.errors.length === 0,
                    errorCount: res.validation.errors.length,
                    materialCount: res.pkg.graphDocument['@graph'].filter(o => o['@type'] && o['@type'].includes(type)).length
                };
            }
            return results;
        }""")

        for name, data in result.items():
            self.assertTrue(data['valid'], f"{name} failed import validation: {data}")
            self.assertGreaterEqual(data['materialCount'], 1, f"{name} missing materials")

if __name__ == '__main__':
    unittest.main()
