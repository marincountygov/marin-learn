// Marin Learn - presentation-scoped PowerPoint export preflight and layout plan
import { buildPresentationModel } from '../core/presentation.js';
import { asArray } from '../core/utils.js';
import { PptxExportError, pptxDiagnostic } from './errors.js';
import {
  collectMarkdownImages,
  collectPptxImageDiagnostics,
  createPptxAssetIndex,
  stripMarkdownImages
} from './images.js';
import {
  allocateVerticalAreas,
  baseBodyArea,
  mediaAreas,
  PPTX_LAYOUT_RULES,
  quoteArea,
  splitAreas,
  titleSupportArea
} from './layouts.js';
import {
  collectMarkdownLinks,
  estimateTextHeight,
  markdownAstToPlainText,
  planMarkdownBlocks
} from './markdown.js';
import { PPTX_GEOMETRY, PPTX_PAGE, PPTX_TEXT } from './theme.js';

export async function preflightPptxExport(pkg, presentationId = null, options = {}) {
  const errors = [];
  const warnings = [];
  if (!pkg?.graphDocument || !pkg?.contentFiles || !pkg?.assetFiles) {
    return failedPreflight(errors.concat(pptxDiagnostic(
      'error',
      'pptx-package-invalid',
      'PowerPoint export requires a complete Marin Learn working package.'
    )), warnings);
  }

  let model;
  try {
    model = await buildPresentationModel({
      graphDocument: pkg.graphDocument,
      presentationId,
      getMarkdown: ({ path }) => (path && Object.hasOwn(pkg.contentFiles, path) ? pkg.contentFiles[path] : null)
    });
  } catch (error) {
    return failedPreflight(errors.concat(pptxDiagnostic(
      'error',
      error?.code || 'pptx-presentation-unavailable',
      error?.message || 'The selected slides could not be resolved.'
    )), warnings);
  }

  for (const diagnostic of model.diagnostics) {
    const target = diagnostic.severity === 'warning' ? warnings : errors;
    target.push(pptxDiagnostic(
      diagnostic.severity === 'warning' ? 'warning' : 'error',
      `pptx-${diagnostic.code}`,
      diagnostic.message,
      diagnostic
    ));
  }

  const assetIndex = createPptxAssetIndex(pkg);
  const seenTitles = new Map();
  const slidePlans = [];

  for (const slide of model.slides) {
    const context = {
      presentationId: model.presentation.id,
      slideId: slide.id,
      slideIdentifier: slide.identifier,
      slideTitle: slide.name,
      slidePosition: slide.position,
      layout: slide.layout
    };
    const title = String(slide.name || '').trim();
    if (!title) {
      errors.push(pptxDiagnostic('error', 'pptx-slide-title-missing', `Slide ${slide.position} has no title.`, context));
    } else {
      const key = title.toLocaleLowerCase(model.presentation.inLanguage || 'en-US');
      if (seenTitles.has(key)) {
        errors.push(pptxDiagnostic(
          'error',
          'pptx-slide-title-duplicate',
          `Slide title “${title}” is repeated. PowerPoint slides require unique, meaningful titles.`,
          { ...context, duplicateOf: seenTitles.get(key) }
        ));
      } else {
        seenTitles.set(key, slide.position);
      }
    }

    validateTitleFit(slide, errors, context);
    const rule = PPTX_LAYOUT_RULES[slide.layout] || PPTX_LAYOUT_RULES.content;
    const count = slide.content.length;
    if (count < rule.minContent) {
      errors.push(pptxDiagnostic(
        'error',
        'pptx-layout-content-missing',
        `Slide “${title || slide.position}” requires at least ${rule.minContent} content block${rule.minContent === 1 ? '' : 's'} for the ${slide.layout} layout.`,
        context
      ));
    }
    if (Number.isFinite(rule.maxContent) && count > rule.maxContent) {
      errors.push(pptxDiagnostic(
        'error',
        'pptx-layout-content-excess',
        `Slide “${title || slide.position}” has ${count} content blocks; the ${slide.layout} layout supports no more than ${rule.maxContent}.`,
        context
      ));
    }
    if (slide.layout === 'split' && count === 1) {
      warnings.push(pptxDiagnostic(
        'warning',
        'pptx-split-single-content',
        `Slide “${title}” uses the split layout with one content block; PowerPoint will use the full content area.`,
        context
      ));
    }

    const preparedEntries = slide.content.map((entry) => prepareEntry(pkg, assetIndex, entry, errors, warnings, context));
    const slidePlan = planSlide(slide, preparedEntries, errors, warnings, context);
    // A title slide with no content of its own shows the deck's description, as the viewer does.
    if (slide.layout === 'title' && !preparedEntries.length) {
      const text = titleDescription(pkg, model);
      if (text) {
        const area = titleSupportArea('title');
        const height = estimateTextHeight(text, area.w, 21, 1.25, 0.06);
        if (height > area.h + 0.001) addOverflow(errors, slide, area.h, height, context);
        slidePlan.description = { text, area, fontSize: 21, requiredHeight: height };
      }
    }
    slidePlans.push({
      ...slidePlan,
      source: slide,
      master: rule.master,
      title,
      notesText: markdownAstToPlainText(slide.speakerNotesAst),
      context
    });
  }

  const filename = `${safeFilename(model.presentation.identifier || model.presentation.name || 'marin-learn-slides')}.pptx`;
  const plan = {
    language: model.presentation.inLanguage || model.learningSet?.inLanguage || 'en-US',
    filename,
    title: model.presentation.name,
    subject: model.presentation.abstract || model.learningSet?.name || 'Marin Learn slides',
    presentationId: model.presentation.id,
    presentationIdentifier: model.presentation.identifier,
    slides: slidePlans
  };

  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    warnings,
    model,
    plan,
    assetIndex
  };
}

// The abstract of the Note the deck is based on, else the abstract of the course.
function titleDescription(pkg, model) {
  const byId = new Map((pkg.graphDocument['@graph'] || []).map((object) => [object?.['@id'], object]));
  const presentation = byId.get(model.presentation.id);
  const basedOn = (presentation?.isBasedOn || []).map((ref) => byId.get(ref?.['@id'])).find(Boolean);
  return String(basedOn?.abstract || model.learningSet?.abstract || '').trim();
}

function prepareEntry(pkg, assetIndex, entry, errors, warnings, slideContext) {
  const context = {
    ...slideContext,
    contentPosition: entry.position,
    contentUnitId: entry.unit?.id,
    contentUnitIdentifier: entry.unit?.identifier,
    displayMode: entry.displayMode
  };
  let ast = [];
  if (!entry.unit) {
    errors.push(pptxDiagnostic('error', 'pptx-content-unresolved', 'A slide content block could not be resolved.', context));
  } else if (entry.displayMode === 'title') {
    ast = paragraphAst(entry.unit.name);
  } else if (entry.displayMode === 'abstract') {
    if (!String(entry.unit.abstract || '').trim()) {
      errors.push(pptxDiagnostic(
        'error',
        'pptx-abstract-missing',
        `Content “${entry.unit.name || entry.unit.identifier}” is set to Short summary but has no abstract.`,
        context
      ));
    }
    ast = paragraphAst(entry.unit.abstract || entry.unit.name);
  } else {
    if (entry.markdownStatus !== 'loaded') {
      errors.push(pptxDiagnostic(
        'error',
        'pptx-full-content-unavailable',
        `Full content for “${entry.unit.name || entry.unit.identifier}” is unavailable.`,
        { ...context, markdownStatus: entry.markdownStatus, cause: entry.markdownError }
      ));
    }
    ast = entry.markdownAst || [];
  }

  const imageNodes = collectMarkdownImages(ast);
  const { images, diagnostics } = collectPptxImageDiagnostics(pkg, assetIndex, imageNodes, context);
  errors.push(...diagnostics);
  const textAst = stripMarkdownImages(ast);
  const links = collectMarkdownLinks(ast);
  for (const link of links) {
    if (/^marin-ref:/i.test(String(link.destination || ''))) {
      warnings.push(pptxDiagnostic(
        'warning',
        'pptx-internal-link-not-interactive',
        `An internal Marin Learn reference in “${entry.unit?.name || entry.unit?.identifier || 'slide content'}” will be rendered as styled text rather than a PowerPoint link.`,
        { ...context, destination: link.destination }
      ));
    }
  }
  validateTables(textAst, errors, context);
  return {
    entry,
    context,
    ast,
    textAst,
    images,
    links,
    plainText: markdownAstToPlainText(textAst)
  };
}

function planSlide(slide, entries, errors, warnings, context) {
  if (slide.layout === 'title' || slide.layout === 'section') {
    return planStructuralSlide(slide, entries, errors, context);
  }
  if (slide.layout === 'split') return planSplitSlide(slide, entries, errors, context);
  if (slide.layout === 'media') return planMediaSlide(slide, entries, errors, warnings, context);
  if (slide.layout === 'quote') return planQuoteSlide(slide, entries, errors, context);
  return planContentSlide(slide, entries, errors, context);
}

function planStructuralSlide(slide, entries, errors, context) {
  const area = titleSupportArea(slide.layout);
  const entryPlans = [];
  if (entries[0]) {
    if (entries[0].images.length) {
      errors.push(pptxDiagnostic(
        'error',
        'pptx-structural-image-unsupported',
        `Slide “${slide.name}” cannot place an image in the ${slide.layout} layout.`,
        entries[0].context
      ));
    }
    const text = entries[0].plainText || entries[0].entry.unit?.name || '';
    const fontSize = slide.layout === 'title' ? 21 : 20;
    const height = estimateTextHeight(text, area.w, fontSize, 1.25, 0.06);
    if (height > area.h + 0.001) addOverflow(errors, slide, area.h, height, context);
    entryPlans.push({ ...entries[0], kind: 'support', area, text, fontSize, requiredHeight: height });
  }
  return { layout: slide.layout, entries: entryPlans, decorative: [] };
}

function planContentSlide(slide, entries, errors, context) {
  const body = baseBodyArea();
  if (entries.length > 1 && entries.some((item) => item.images.length)) {
    errors.push(pptxDiagnostic(
      'error',
      'pptx-content-multiple-with-image',
      `Slide “${slide.name}” combines multiple content blocks with images. Use one content block, remove the image, or choose another layout.`,
      context
    ));
  }

  if (entries.length === 1 && entries[0]?.images.length) {
    if (entries[0].images.length > 1) {
      errors.push(pptxDiagnostic('error', 'pptx-content-image-count', `Slide “${slide.name}” supports one image in the content layout.`, entries[0].context));
    }
    const textArea = { x: body.x, y: body.y, w: 7.25, h: body.h };
    const mediaArea = { x: 8.32, y: 1.38, w: 4.28, h: 4.95 };
    const planned = planStandardEntry(entries[0], textArea, errors, slide);
    return {
      layout: slide.layout,
      entries: [{ ...planned, area: textArea, imageAreas: stackImageAreas(mediaArea, entries[0].images.length) }],
      decorative: []
    };
  }

  const provisional = entries.map((entry) => {
    const planned = planStandardEntry(entry, { ...body, h: Infinity }, errors, slide, false);
    return { entry, requiredHeight: Math.max(planned.requiredHeight, 0.68), planned };
  });
  const allocation = allocateVerticalAreas(provisional.map((item) => item.requiredHeight));
  if (allocation.requiredHeight > allocation.availableHeight + 0.001) {
    addOverflow(errors, slide, allocation.availableHeight, allocation.requiredHeight, context);
  }
  const entryPlans = provisional.map((item, index) => ({
    ...item.planned,
    area: allocation.areas[index],
    imageAreas: []
  }));
  return { layout: slide.layout, entries: entryPlans, decorative: [] };
}

function planSplitSlide(slide, entries, errors, context) {
  const areas = splitAreas(entries.length);
  const entryPlans = entries.map((entry, index) => {
    const area = areas[index] || areas[0];
    if (entry.images.length > 1) {
      errors.push(pptxDiagnostic('error', 'pptx-split-image-count', `A split column on slide “${slide.name}” supports one image.`, entry.context));
    }
    if (entry.images.length) {
      const textArea = { ...area, h: 3.64 };
      const imageArea = { x: area.x, y: area.y + 3.87, w: area.w, h: 1.48 };
      const planned = planStandardEntry(entry, textArea, errors, slide);
      return { ...planned, area: textArea, imageAreas: [imageArea] };
    }
    const planned = planStandardEntry(entry, area, errors, slide);
    return { ...planned, area, imageAreas: [] };
  });
  return {
    layout: slide.layout,
    entries: entryPlans,
    decorative: entries.length === 2 ? [{ type: 'split-divider', x: PPTX_PAGE.width / 2, y: 1.28, w: 0, h: 5.22 }] : []
  };
}

function planMediaSlide(slide, entries, errors, warnings, context) {
  const entry = entries[0];
  if (!entry) return { layout: slide.layout, entries: [], decorative: [] };
  if (entry.images.length > 2) {
    errors.push(pptxDiagnostic('error', 'pptx-media-image-count', `Slide “${slide.name}” supports no more than two media images.`, entry.context));
  }
  const areas = mediaAreas(entry.images.length > 0);
  if (!entry.images.length) {
    warnings.push(pptxDiagnostic(
      'warning',
      'pptx-media-image-missing',
      `Slide “${slide.name}” uses the media layout without an image. PowerPoint will use a branded decorative fallback.`,
      context
    ));
  }
  const planned = planStandardEntry(entry, areas.text, errors, slide);
  return {
    layout: slide.layout,
    entries: [{ ...planned, area: areas.text, imageAreas: stackImageAreas(areas.media, entry.images.length) }],
    decorative: areas.fallback ? [{ type: 'media-fallback', area: areas.media }] : []
  };
}

function planQuoteSlide(slide, entries, errors, context) {
  const entry = entries[0];
  const area = quoteArea();
  if (!entry) return { layout: slide.layout, entries: [], decorative: [] };
  if (entry.images.length) {
    errors.push(pptxDiagnostic('error', 'pptx-quote-image-unsupported', `Slide “${slide.name}” cannot place images in the quote layout.`, entry.context));
  }
  const text = entry.plainText || entry.entry.unit?.name || '';
  const height = estimateTextHeight(text, area.w - 0.9, PPTX_TEXT.quote, 1.28, 0.18);
  if (height > area.h + 0.001) addOverflow(errors, slide, area.h, height, context);
  return {
    layout: slide.layout,
    entries: [{ ...entry, kind: 'quote', area, text, requiredHeight: height, imageAreas: [] }],
    decorative: [{ type: 'quote-mark', x: 0.88, y: 1.37, w: 0.62, h: 0.62 }]
  };
}

function planStandardEntry(entry, area, errors, slide, enforceHeight = true) {
  const headingText = entry.entry.unit?.name || '';
  // A Note section alone on a slide is already named by the slide title.
  const aloneNoteSection = entry.entry.unit?.kind === 'note-section' && slide.content?.length === 1;
  const heading = entry.entry.displayMode === 'title' || aloneNoteSection || sameText(headingText, slide.name)
    ? null
    : {
        text: headingText,
        fontSize: PPTX_TEXT.entryHeading,
        height: estimateTextHeight(headingText, area.w, PPTX_TEXT.entryHeading, 1.15, 0.02)
      };
  const textArea = {
    x: area.x,
    y: area.y + (heading ? heading.height + 0.1 : 0),
    w: area.w,
    h: Math.max(0, area.h - (heading ? heading.height + 0.1 : 0))
  };
  const markdownPlan = planMarkdownBlocks(entry.textAst, {
    width: textArea.w,
    maxHeight: enforceHeight ? textArea.h : Infinity,
    namePrefix: `Content ${entry.entry.unit?.identifier || entry.entry.position}`
  });
  const requiredHeight = (heading ? heading.height + 0.1 : 0) + markdownPlan.height;
  if (enforceHeight && requiredHeight > area.h + 0.001) addOverflow(errors, slide, area.h, requiredHeight, entry.context);
  return {
    ...entry,
    kind: 'standard',
    heading,
    textArea,
    markdownPlan,
    requiredHeight
  };
}

function validateTitleFit(slide, errors, context) {
  const layout = slide.layout;
  const fontSize = layout === 'title' ? PPTX_TEXT.titleHero : layout === 'section' ? PPTX_TEXT.titleSection : PPTX_TEXT.title;
  const width = layout === 'title' || layout === 'section' ? 11.63 : 11.88;
  const height = layout === 'title' ? 1.3 : layout === 'section' ? 1.25 : PPTX_GEOMETRY.titleHeight;
  const required = estimateTextHeight(slide.name || '', width, fontSize, 1.12, 0.01);
  if (required > height + 0.001) {
    errors.push(pptxDiagnostic(
      'error',
      'pptx-title-overflow',
      `Slide title “${slide.name}” is too long for the selected layout. Shorten the title.`,
      { ...context, availableHeight: height, requiredHeight: required }
    ));
  }
}

function validateTables(ast, errors, context) {
  walkBlocks(ast, (block) => {
    if (block.type !== 'table') return;
    const columns = asArray(block.header).length;
    const rows = asArray(block.rows).length + 1;
    if (columns > 6) {
      errors.push(pptxDiagnostic('error', 'pptx-table-too-wide', `A table has ${columns} columns; PowerPoint export supports no more than 6.`, context));
    }
    if (rows > 10) {
      errors.push(pptxDiagnostic('error', 'pptx-table-too-tall', `A table has ${rows} rows; PowerPoint export supports no more than 10.`, context));
    }
  });
}

function walkBlocks(ast, callback) {
  for (const block of asArray(ast)) {
    callback(block);
    if (block?.type === 'blockquote') walkBlocks(block.children, callback);
    if (block?.type === 'list') for (const item of asArray(block.items)) walkBlocks(item, callback);
  }
}

function stackImageAreas(area, count) {
  if (!count) return [];
  const visible = Math.min(count, 2);
  const gap = 0.18;
  const height = (area.h - gap * (visible - 1)) / visible;
  return Array.from({ length: visible }, (_, index) => ({
    x: area.x,
    y: area.y + index * (height + gap),
    w: area.w,
    h: height
  }));
}

function addOverflow(errors, slide, availableHeight, requiredHeight, context) {
  errors.push(pptxDiagnostic(
    'error',
    'pptx-content-overflow',
    `Slide “${slide.name}” contains too much content for the ${slide.layout} layout. Use Short summary, divide the content, or choose another layout.`,
    { ...context, availableHeight, requiredHeight }
  ));
}

function sameText(first, second) {
  return String(first || '').trim().toLocaleLowerCase() === String(second || '').trim().toLocaleLowerCase();
}

function paragraphAst(text) {
  return [{ type: 'paragraph', children: [{ type: 'text', value: String(text || '') }] }];
}

function safeFilename(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'marin-learn-slides';
}

function failedPreflight(errors, warnings) {
  return { status: 'fail', errors, warnings, model: null, plan: null, assetIndex: new Map() };
}

export function assertPptxPreflight(preflight) {
  if (preflight?.status === 'pass') return preflight;
  throw new PptxExportError('The selected slides cannot be exported to PowerPoint.', 'pptx-preflight-failed', {
    diagnostics: preflight?.errors || []
  });
}
