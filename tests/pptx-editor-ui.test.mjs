import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  choosePptxPresentationId,
  pptxDiagnosticContext,
  pptxDiagnosticDisplayMessage
} from '../editor/assets/pptx-export.js';

const first = { '@id': 'urn:uuid:11111111-1111-4111-8111-111111111111', name: 'First deck' };
const second = { '@id': 'urn:uuid:22222222-2222-4222-8222-222222222222', name: 'Second deck' };

test('PowerPoint deck selection preserves a valid selection, then active deck, then graph order', () => {
  assert.equal(choosePptxPresentationId([first, second], second['@id'], first['@id']), second['@id']);
  assert.equal(choosePptxPresentationId([first, second], 'missing', second['@id']), second['@id']);
  assert.equal(choosePptxPresentationId([first, second], 'missing', 'also-missing'), first['@id']);
  assert.equal(choosePptxPresentationId([], first['@id'], second['@id']), null);
});

test('PowerPoint diagnostics use plain-language slide context', () => {
  assert.equal(pptxDiagnosticContext({ slidePosition: 3, slideTitle: 'Data responsibilities' }), 'Slide 3: Data responsibilities');
  assert.equal(pptxDiagnosticContext({ slidePosition: 4 }), 'Slide 4');
  assert.equal(pptxDiagnosticContext({ slideTitle: 'Opening' }), 'Opening');
  assert.equal(pptxDiagnosticContext({}), '');
});

test('PowerPoint diagnostic display removes repeated slide context without changing standalone diagnostics', () => {
  assert.equal(
    pptxDiagnosticDisplayMessage({
      slidePosition: 4,
      slideTitle: 'The Marin App Shell',
      message: 'Slide “The Marin App Shell” uses the media layout without an image.'
    }),
    'Uses the media layout without an image.'
  );
  assert.equal(
    pptxDiagnosticDisplayMessage({
      slidePosition: 2,
      slideTitle: 'MarinOS Foundations',
      message: 'Slide title “MarinOS Foundations” is repeated.'
    }),
    'The title is repeated.'
  );
  assert.equal(
    pptxDiagnosticDisplayMessage({
      slidePosition: 5,
      message: 'Slide 5 has no title.'
    }),
    'Has no title.'
  );
  assert.equal(
    pptxDiagnosticDisplayMessage({
      slideTitle: 'Data table',
      message: 'A table has 8 columns; PowerPoint export supports no more than 6.'
    }),
    'A table has 8 columns; PowerPoint export supports no more than 6.'
  );
});

test('Review and Download exposes a lazy, presentation-scoped PowerPoint workflow', async () => {
  const [html, appSource, controllerSource] = await Promise.all([
    readFile(new URL('../editor/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../editor/assets/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../editor/assets/pptx-export.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /id="pptx-export-section"[^>]*aria-busy="false"/);
  assert.match(html, /id="pptx-presentation-select"/);
  assert.match(html, /id="btn-export-pptx"[^>]*disabled[^>]*aria-disabled="true"/);
  assert.match(html, /generated in this browser and is not added to the learning package/);
  assert.doesNotMatch(html, /pptxgen\.bundle\.js/);

  assert.match(appSource, /createPptxExportModule/);
  assert.match(appSource, /tabName === 'export'\) void pptxExportModule\.render\(\)/);
  assert.match(appSource, /getPreferredPresentationId: \(\) => slidesModule\.getActiveDeckId\(\)/);

  assert.match(controllerSource, /analyzePresentationForPptx/);
  assert.match(controllerSource, /exportPresentationToPptx/);
  assert.match(controllerSource, /setAttribute\('aria-busy'/);
  assert.match(controllerSource, /PowerPoint downloaded\. It was generated in this browser and was not added to the learning package\./);
  assert.match(controllerSource, /requestAnimationFrame\(\(\) => focusAfter\?\.focus\(\)\)/);
});
