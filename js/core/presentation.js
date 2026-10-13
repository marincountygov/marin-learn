// Marin Learn - Shared presentation semantics
import { SLIDE_DISPLAY_MODES, SLIDE_LAYOUTS, TYPES } from './constants.js';
import { parseMarkdown } from './markdown.js';
import { asArray, deepClone } from './utils.js';

export const DEFAULT_SLIDE_LAYOUT = 'content';
// The Marin Learn v1 schema defines "full" as the default when displayMode is omitted.
export const DEFAULT_SLIDE_DISPLAY_MODE = 'full';

export class PresentationModelError extends Error {
  constructor(message, code = 'presentation-model-error') {
    super(message);
    this.name = 'PresentationModelError';
    this.code = code;
  }
}

export function orderedListItems(owner, property) {
  return [...asArray(owner?.[property]?.itemListElement)]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
}

export function findPresentation(graphDocument, presentationId = null) {
  const graph = graphArray(graphDocument);
  const presentations = graph.filter((object) => hasType(object, TYPES.PRESENTATION));
  if (!presentationId) return presentations[0] || null;
  const normalized = String(presentationId);
  return presentations.find((presentation) => (
    presentation?.['@id'] === normalized ||
    presentation?.identifier === normalized ||
    presentation?.['@id'] === `urn:uuid:${normalized}`
  )) || null;
}

/**
 * Resolve a Marin Learn Presentation into one canonical, renderer-neutral model.
 * Markdown is loaded only for entries whose effective display mode is "full".
 */
export async function buildPresentationModel({
  graphDocument,
  presentationId = null,
  getMarkdown = null
} = {}) {
  const graph = graphArray(graphDocument);
  const byId = new Map(graph.filter(Boolean).map((object) => [object['@id'], object]));
  const learningSet = graph.find((object) => hasType(object, TYPES.LEARNING_SET)) || null;
  const presentation = findPresentation(graphDocument, presentationId);

  if (!presentation) {
    throw new PresentationModelError('No matching presentation was found.', 'presentation-not-found');
  }

  const diagnostics = [];
  const slideItems = orderedListItems(presentation, 'marin:slideSequence');
  const slides = (await Promise.all(slideItems.map(async (listItem, index) => {
    const slideId = listItem?.item?.['@id'];
    const slide = byId.get(slideId);
    if (!slide || !hasType(slide, TYPES.SLIDE)) {
      diagnostics.push(diagnostic(
        'error',
        'slide-reference-unresolved',
        `Slide reference ${slideId || '(missing @id)'} could not be resolved.`,
        { presentationId: presentation['@id'], slideId, position: index + 1 }
      ));
      return null;
    }

    const rawLayout = slide['marin:layout'];
    const layout = SLIDE_LAYOUTS.includes(rawLayout) ? rawLayout : DEFAULT_SLIDE_LAYOUT;
    if (rawLayout !== layout) {
      diagnostics.push(diagnostic(
        'error',
        'slide-layout-invalid',
        `Slide “${slide.name || slide.identifier || index + 1}” has an unsupported layout.`,
        { presentationId: presentation['@id'], slideId: slide['@id'], value: rawLayout }
      ));
    }

    const contentItems = orderedListItems(slide, 'marin:contentSequence');
    const content = await Promise.all(contentItems.map(async (entry, contentIndex) => {
      const unitId = entry?.item?.['@id'];
      const unit = byId.get(unitId);
      const rawDisplayMode = entry?.['marin:displayMode'];
      const displayMode = rawDisplayMode == null
        ? DEFAULT_SLIDE_DISPLAY_MODE
        : rawDisplayMode;

      if (!SLIDE_DISPLAY_MODES.includes(displayMode)) {
        diagnostics.push(diagnostic(
          'error',
          'slide-display-mode-invalid',
          `Slide “${slide.name || slide.identifier || index + 1}” has an unsupported display mode.`,
          {
            presentationId: presentation['@id'],
            slideId: slide['@id'],
            contentUnitId: unitId,
            value: rawDisplayMode
          }
        ));
      }

      if (!unit || !hasType(unit, TYPES.CONTENT_UNIT)) {
        diagnostics.push(diagnostic(
          'error',
          'slide-content-reference-unresolved',
          `Content reference ${unitId || '(missing @id)'} could not be resolved.`,
          {
            presentationId: presentation['@id'],
            slideId: slide['@id'],
            contentUnitId: unitId,
            position: contentIndex + 1
          }
        ));
        return {
          position: contentIndex + 1,
          sourcePosition: entry?.position,
          displayMode: SLIDE_DISPLAY_MODES.includes(displayMode) ? displayMode : DEFAULT_SLIDE_DISPLAY_MODE,
          unit: null,
          markdown: null,
          markdownAst: [],
          markdownStatus: 'unresolved',
          markdownError: null
        };
      }

      let markdown = null;
      let markdownAst = [];
      let markdownStatus = 'not-required';
      let markdownError = null;
      const effectiveDisplayMode = SLIDE_DISPLAY_MODES.includes(displayMode)
        ? displayMode
        : DEFAULT_SLIDE_DISPLAY_MODE;

      if (effectiveDisplayMode === 'full') {
        const path = unit.encoding?.contentUrl || '';
        if (typeof getMarkdown !== 'function') {
          markdownStatus = 'unavailable';
          diagnostics.push(diagnostic(
            'error',
            'slide-markdown-loader-missing',
            `Full content for “${unit.name || unit.identifier}” could not be loaded because no Markdown loader was provided.`,
            { presentationId: presentation['@id'], slideId: slide['@id'], contentUnitId: unit['@id'], path }
          ));
        } else {
          try {
            const loaded = await getMarkdown({
              contentUnit: unit,
              path,
              slide,
              presentation,
              listItem: entry
            });
            if (loaded == null) {
              markdownStatus = 'missing';
              markdownError = 'The referenced Markdown file is unavailable.';
              diagnostics.push(diagnostic(
                'error',
                'slide-markdown-missing',
                `Markdown for “${unit.name || unit.identifier}” is unavailable.`,
                { presentationId: presentation['@id'], slideId: slide['@id'], contentUnitId: unit['@id'], path }
              ));
            } else {
              markdown = String(loaded);
              markdownAst = parseMarkdown(markdown);
              markdownStatus = 'loaded';
            }
          } catch (error) {
            markdownStatus = 'error';
            markdownError = error?.message || 'The referenced Markdown file could not be loaded.';
            diagnostics.push(diagnostic(
              'error',
              'slide-markdown-load-failed',
              `Markdown for “${unit.name || unit.identifier}” could not be loaded.`,
              {
                presentationId: presentation['@id'],
                slideId: slide['@id'],
                contentUnitId: unit['@id'],
                path,
                cause: markdownError
              }
            ));
          }
        }
      }

      return {
        position: contentIndex + 1,
        sourcePosition: entry?.position,
        displayMode: effectiveDisplayMode,
        unit: {
          id: unit['@id'],
          identifier: unit.identifier || '',
          name: unit.name || '',
          abstract: unit.abstract || '',
          learningResourceType: unit.learningResourceType || '',
          contentUrl: unit.encoding?.contentUrl || ''
        },
        markdown,
        markdownAst,
        markdownStatus,
        markdownError
      };
    }));

    const speakerNotes = String(slide['marin:speakerNotes'] || '');
    return {
      id: slide['@id'],
      identifier: slide.identifier || '',
      name: slide.name || '',
      layout,
      sourcePosition: listItem?.position,
      position: index + 1,
      content,
      speakerNotes,
      speakerNotesAst: parseMarkdown(speakerNotes)
    };
  }))).filter(Boolean);

  return {
    learningSet: learningSet ? {
      id: learningSet['@id'],
      identifier: learningSet.identifier || '',
      name: learningSet.name || '',
      inLanguage: learningSet.inLanguage || 'en-US'
    } : null,
    presentation: {
      id: presentation['@id'],
      identifier: presentation.identifier || '',
      name: presentation.name || '',
      abstract: presentation.abstract || '',
      inLanguage: presentation.inLanguage || learningSet?.inLanguage || 'en-US'
    },
    slides,
    diagnostics
  };
}

/**
 * Replace a Slide content sequence from editor rows while preserving the original
 * ListItem object for rows that already existed. This prevents unrelated edits
 * from discarding supported source properties.
 */
export function setSlideContentSequence(slide, rows = []) {
  if (!slide || typeof slide !== 'object') {
    throw new PresentationModelError('A Slide object is required.', 'slide-required');
  }
  if (!Array.isArray(rows)) {
    throw new PresentationModelError('Slide content rows must be an array.', 'slide-content-rows-invalid');
  }

  const originalEntries = orderedListItems(slide, 'marin:contentSequence');
  if (!rows.length) {
    delete slide['marin:contentSequence'];
    return null;
  }

  const nextEntries = rows.map((row, index) => {
    const itemId = String(row?.itemId || '');
    if (!itemId) {
      throw new PresentationModelError(`Content block ${index + 1} has no selected ContentUnit.`, 'slide-content-required');
    }
    const displayMode = row?.displayMode ?? DEFAULT_SLIDE_DISPLAY_MODE;
    if (!SLIDE_DISPLAY_MODES.includes(displayMode)) {
      throw new PresentationModelError(`Content block ${index + 1} has an unsupported display mode.`, 'slide-display-mode-invalid');
    }

    const sourceIndex = Number(row?.sourceIndex);
    const source = Number.isInteger(sourceIndex) && sourceIndex >= 0
      ? originalEntries[sourceIndex]
      : null;
    const entry = source ? deepClone(source) : {};
    entry['@type'] = 'ListItem';
    entry.position = index + 1;
    entry.item = { '@id': itemId };
    entry['marin:displayMode'] = displayMode;
    return entry;
  });

  const sequence = slide['marin:contentSequence'] && typeof slide['marin:contentSequence'] === 'object'
    ? slide['marin:contentSequence']
    : {};
  sequence['@type'] = 'ItemList';
  sequence.itemListElement = nextEntries;
  slide['marin:contentSequence'] = sequence;
  return sequence;
}

function graphArray(graphDocument) {
  const graph = graphDocument?.['@graph'];
  if (!Array.isArray(graph)) {
    throw new PresentationModelError('Presentation source is missing an @graph array.', 'graph-missing');
  }
  return graph;
}

function hasType(object, type) {
  return asArray(object?.['@type']).includes(type);
}

function diagnostic(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}
