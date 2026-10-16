// Marin Learn - generate raw, editable PowerPoint output with PptxGenJS
import { imageSizingContain } from './images.js';
import { renderMarkdownPlan } from './markdown.js';
import { assertPptxPreflight } from './preflight.js';
import { PPTX_BRAND, PPTX_GEOMETRY, PPTX_PAGE, PPTX_TEXT } from './theme.js';

export async function generateRawPptx(preflight, runtime, options = {}) {
  assertPptxPreflight(preflight);
  if (typeof runtime?.PptxGenJS !== 'function') {
    throw new Error('PptxGenJS is unavailable. Load the vendored PowerPoint runtime before exporting.');
  }

  const { plan } = preflight;
  const pptx = new runtime.PptxGenJS();
  pptx.defineLayout({ name: PPTX_PAGE.layoutName, width: PPTX_PAGE.width, height: PPTX_PAGE.height });
  pptx.layout = PPTX_PAGE.layoutName;
  const author = options.author || 'County of Marin';
  const company = options.company || 'County of Marin';
  pptx.author = author;
  pptx.company = company;
  pptx.subject = plan.subject || 'Marin Learn slide deck';
  pptx.title = plan.title || 'Marin Learn slide deck';
  pptx.lang = plan.language;
  pptx.theme = {
    headFontFace: PPTX_BRAND.fonts.heading,
    bodyFontFace: PPTX_BRAND.fonts.body,
    lang: plan.language
  };

  defineMasters(pptx, plan.language);
  const manifest = createManifest(plan, { author, company });

  for (const slidePlan of plan.slides) {
    const slideManifest = {
      number: slidePlan.source.position,
      id: slidePlan.source.id,
      identifier: slidePlan.source.identifier,
      title: slidePlan.title,
      layout: slidePlan.layout,
      master: slidePlan.master,
      notes: slidePlan.notesText,
      content: slidePlan.entries.map((entry) => ({
        position: entry.entry.position,
        unitId: entry.entry.unit?.id || null,
        unitIdentifier: entry.entry.unit?.identifier || '',
        displayMode: entry.entry.displayMode
      })),
      elements: []
    };
    manifest.slides.push(slideManifest);
    const record = (element) => slideManifest.elements.push(element);
    const slide = pptx.addSlide(slidePlan.master);
    addSlideTitle(slide, slidePlan, plan.language, record);
    renderSlidePlan(pptx, slide, slidePlan, plan.language, record);
    if (slidePlan.notesText) slide.addNotes(slidePlan.notesText);
  }

  const bytes = await pptx.write({ outputType: 'arraybuffer', compression: true });
  return { bytes, manifest };
}

function defineMasters(pptx, language) {
  const standardTitle = {
    name: 'title',
    type: 'title',
    x: PPTX_GEOMETRY.marginLeft,
    y: PPTX_GEOMETRY.titleTop,
    w: PPTX_PAGE.width - PPTX_GEOMETRY.marginLeft - PPTX_GEOMETRY.marginRight,
    h: PPTX_GEOMETRY.titleHeight,
    margin: 0,
    fontFace: PPTX_BRAND.fonts.heading,
    fontSize: PPTX_TEXT.title,
    bold: true,
    color: PPTX_BRAND.colors.black,
    lang: language
  };
  const footerObjects = [
    {
      line: {
        x: PPTX_GEOMETRY.marginLeft,
        y: PPTX_GEOMETRY.footerRuleY,
        w: PPTX_PAGE.width - PPTX_GEOMETRY.marginLeft - PPTX_GEOMETRY.marginRight,
        h: 0,
        line: { color: PPTX_BRAND.colors.lightGray, width: 1 },
        objectName: 'Decorative: footer rule'
      }
    },
    {
      text: {
        text: PPTX_BRAND.identity,
        options: {
          x: PPTX_GEOMETRY.marginLeft,
          y: PPTX_GEOMETRY.footerTextY,
          w: 4.4,
          h: PPTX_GEOMETRY.footerHeight,
          margin: 0,
          fontFace: PPTX_BRAND.fonts.body,
          fontSize: PPTX_TEXT.footer,
          color: PPTX_BRAND.colors.darkGray,
          lang: language,
          objectName: 'Footer identity'
        }
      }
    }
  ];

  pptx.defineSlideMaster({
    title: 'MARIN_STANDARD',
    background: { color: PPTX_BRAND.colors.white },
    objects: [
      { placeholder: { options: standardTitle, text: '' } },
      ...footerObjects
    ],
    slideNumber: {
      x: 12.05,
      y: PPTX_GEOMETRY.footerTextY,
      w: 0.55,
      h: PPTX_GEOMETRY.footerHeight,
      margin: 0,
      align: 'right',
      fontFace: PPTX_BRAND.fonts.body,
      fontSize: PPTX_TEXT.footer,
      color: PPTX_BRAND.colors.darkGray,
      lang: language
    }
  });

  pptx.defineSlideMaster({
    title: 'MARIN_SECTION',
    background: { color: PPTX_BRAND.colors.blue },
    objects: [
      {
        placeholder: {
          options: {
            ...standardTitle,
            x: 0.85,
            y: 2.2,
            w: 11.63,
            h: 1.25,
            fontSize: PPTX_TEXT.titleSection,
            color: PPTX_BRAND.colors.white,
            align: 'center',
            valign: 'mid'
          },
          text: ''
        }
      }
    ]
  });

  pptx.defineSlideMaster({
    title: 'MARIN_TITLE',
    background: { color: PPTX_BRAND.colors.blue },
    objects: [
      {
        placeholder: {
          options: {
            ...standardTitle,
            x: 0.85,
            y: 1.72,
            w: 11.63,
            h: 1.3,
            fontSize: PPTX_TEXT.titleHero,
            color: PPTX_BRAND.colors.white,
            align: 'center',
            valign: 'mid'
          },
          text: ''
        }
      }
    ]
  });
}

function addSlideTitle(slide, slidePlan, language, record) {
  const hero = slidePlan.master === 'MARIN_TITLE';
  const section = slidePlan.master === 'MARIN_SECTION';
  const options = {
    placeholder: 'title',
    margin: 0,
    fontFace: PPTX_BRAND.fonts.heading,
    fontSize: hero ? PPTX_TEXT.titleHero : section ? PPTX_TEXT.titleSection : PPTX_TEXT.title,
    bold: true,
    color: hero || section ? PPTX_BRAND.colors.white : PPTX_BRAND.colors.black,
    lang: language
  };
  slide.addText(slidePlan.title, options);
  record({
    name: 'Slide title',
    type: 'text',
    x: hero || section ? 0.85 : PPTX_GEOMETRY.marginLeft,
    y: hero ? 1.72 : section ? 2.2 : PPTX_GEOMETRY.titleTop,
    w: hero || section ? 11.63 : PPTX_PAGE.width - PPTX_GEOMETRY.marginLeft - PPTX_GEOMETRY.marginRight,
    h: hero ? 1.3 : section ? 1.25 : PPTX_GEOMETRY.titleHeight,
    text: slidePlan.title,
    foreground: options.color,
    background: hero || section ? PPTX_BRAND.colors.blue : PPTX_BRAND.colors.white,
    fontFace: PPTX_BRAND.fonts.heading,
    fontSize: options.fontSize,
    bold: true,
    semantic: 'slide-title-placeholder'
  });
  if (!hero && !section) recordMasterFooter(record);
}

function renderSlidePlan(pptx, slide, slidePlan, language, record) {
  if (slidePlan.layout === 'title' || slidePlan.layout === 'section') {
    renderStructuralSlide(slide, slidePlan, language, record);
  } else if (slidePlan.layout === 'quote') {
    renderQuoteSlide(pptx, slide, slidePlan, language, record);
  } else {
    for (const entryPlan of slidePlan.entries) renderStandardEntry(slide, entryPlan, language, record);
    for (const decorative of slidePlan.decorative) renderDecorative(pptx, slide, decorative, record);
  }
}

function renderStructuralSlide(slide, slidePlan, language, record) {
  const support = slidePlan.entries[0] || (slidePlan.description && { ...slidePlan.description });
  if (!support) return;
  slide.addText(support.text, {
    x: support.area.x,
    y: support.area.y,
    w: support.area.w,
    h: support.area.h,
    margin: 0,
    fontFace: PPTX_BRAND.fonts.body,
    fontSize: support.fontSize,
    color: PPTX_BRAND.colors.white,
    align: 'center',
    valign: 'mid',
    lang: language,
    objectName: 'Supporting text'
  });
  record({
    name: 'Supporting text',
    type: 'text',
    ...support.area,
    text: support.text,
    foreground: PPTX_BRAND.colors.white,
    background: PPTX_BRAND.colors.blue,
    fontFace: PPTX_BRAND.fonts.body,
    fontSize: support.fontSize,
    semantic: 'supporting-text'
  });
}

function renderStandardEntry(slide, entryPlan, language, record) {
  if (entryPlan.heading) {
    slide.addText(entryPlan.heading.text, {
      x: entryPlan.area.x,
      y: entryPlan.area.y,
      w: entryPlan.area.w,
      h: entryPlan.heading.height,
      margin: 0,
      fontFace: PPTX_BRAND.fonts.heading,
      fontSize: entryPlan.heading.fontSize,
      bold: true,
      color: PPTX_BRAND.colors.black,
      lang: language,
      objectName: `Content heading: ${entryPlan.entry.unit?.identifier || entryPlan.entry.position}`
    });
    record({
      name: `Content heading: ${entryPlan.entry.unit?.identifier || entryPlan.entry.position}`,
      type: 'text',
      x: entryPlan.area.x,
      y: entryPlan.area.y,
      w: entryPlan.area.w,
      h: entryPlan.heading.height,
      text: entryPlan.heading.text,
      foreground: PPTX_BRAND.colors.black,
      background: PPTX_BRAND.colors.white,
      fontFace: PPTX_BRAND.fonts.heading,
      fontSize: entryPlan.heading.fontSize,
      bold: true,
      semantic: 'content-heading'
    });
  }

  renderMarkdownPlan({
    slide,
    plan: entryPlan.markdownPlan,
    area: entryPlan.textArea,
    language,
    record
  });

  for (const [index, image] of entryPlan.images.entries()) {
    const box = entryPlan.imageAreas[index];
    if (!box) continue;
    const sizing = imageSizingContain(image, box.x, box.y, box.w, box.h);
    slide.addImage({
      data: image.data,
      ...sizing,
      altText: image.altText,
      objectName: image.objectName
    });
    record({
      name: image.objectName,
      type: 'image',
      ...sizing,
      text: image.altText,
      altText: image.altText,
      decorative: image.decorative,
      foreground: null,
      background: null,
      semantic: image.decorative ? 'decorative-image' : 'informative-image'
    });
  }
}

function renderQuoteSlide(pptx, slide, slidePlan, language, record) {
  const entry = slidePlan.entries[0];
  if (!entry) return;
  const quoteBox = {
    x: entry.area.x + 0.45,
    y: entry.area.y + 0.15,
    w: entry.area.w - 0.75,
    h: Math.min(entry.area.h - 0.8, entry.requiredHeight + 0.28)
  };
  slide.addText(entry.text, {
    ...quoteBox,
    margin: 0,
    fontFace: PPTX_BRAND.fonts.heading,
    fontSize: PPTX_TEXT.quote,
    italic: true,
    color: PPTX_BRAND.colors.black,
    align: 'center',
    valign: 'mid',
    lang: language,
    objectName: 'Featured quotation'
  });
  record({
    name: 'Featured quotation',
    type: 'text',
    ...quoteBox,
    text: entry.text,
    foreground: PPTX_BRAND.colors.black,
    background: PPTX_BRAND.colors.white,
    fontFace: PPTX_BRAND.fonts.heading,
    fontSize: PPTX_TEXT.quote,
    italic: true,
    semantic: 'quotation'
  });
  const attribution = entry.entry.unit?.name || '';
  if (attribution && !sameText(attribution, entry.text) && !sameText(attribution, slidePlan.title)) {
    const box = { x: 2.2, y: 5.78, w: PPTX_PAGE.width - 4.4, h: 0.36 };
    slide.addText(attribution, {
      ...box,
      margin: 0,
      fontFace: PPTX_BRAND.fonts.body,
      fontSize: 14,
      color: PPTX_BRAND.colors.darkGray,
      align: 'center',
      lang: language,
      objectName: 'Quotation source'
    });
    record({
      name: 'Quotation source',
      type: 'text',
      ...box,
      text: attribution,
      foreground: PPTX_BRAND.colors.darkGray,
      background: PPTX_BRAND.colors.white,
      fontFace: PPTX_BRAND.fonts.body,
      fontSize: 14,
      semantic: 'quotation-source'
    });
  }
  for (const decorative of slidePlan.decorative) renderDecorative(pptx, slide, decorative, record);
}

function renderDecorative(pptx, slide, item, record) {
  if (item.type === 'split-divider') {
    slide.addShape(pptx.ShapeType.line, {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      line: { color: PPTX_BRAND.colors.lightGray, width: 1.2 },
      objectName: 'Decorative: split divider'
    });
    record({ name: 'Decorative: split divider', type: 'shape', ...item, decorative: true, semantic: 'decorative' });
    return;
  }
  if (item.type === 'quote-mark') {
    slide.addText('“', {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      margin: 0,
      fontFace: PPTX_BRAND.fonts.heading,
      fontSize: 54,
      bold: true,
      color: PPTX_BRAND.colors.gold,
      objectName: 'Decorative: quotation mark'
    });
    record({ name: 'Decorative: quotation mark', type: 'text', ...item, text: '“', decorative: true, semantic: 'decorative' });
    return;
  }
  if (item.type === 'media-fallback') {
    const { area } = item;
    const bars = [
      { y: area.y + 0.45, h: 0.55, color: PPTX_BRAND.colors.blue },
      { y: area.y + 1.5, h: 0.55, color: PPTX_BRAND.colors.green },
      { y: area.y + 2.55, h: 0.55, color: PPTX_BRAND.colors.gold }
    ];
    bars.forEach((bar, index) => {
      slide.addShape(pptx.ShapeType.rect, {
        x: area.x + index * 0.2,
        y: bar.y,
        w: area.w - index * 0.4,
        h: bar.h,
        fill: { color: bar.color },
        line: { color: bar.color },
        radius: 0.08,
        objectName: `Decorative: media accent ${index + 1}`
      });
      record({
        name: `Decorative: media accent ${index + 1}`,
        type: 'shape',
        x: area.x + index * 0.2,
        y: bar.y,
        w: area.w - index * 0.4,
        h: bar.h,
        decorative: true,
        semantic: 'decorative'
      });
    });
  }
}

function sameText(first, second) {
  return String(first || '').trim().toLocaleLowerCase() === String(second || '').trim().toLocaleLowerCase();
}

function recordMasterFooter(record) {
  record({
    name: 'Decorative: footer rule',
    type: 'shape',
    x: PPTX_GEOMETRY.marginLeft,
    y: PPTX_GEOMETRY.footerRuleY,
    w: PPTX_PAGE.width - PPTX_GEOMETRY.marginLeft - PPTX_GEOMETRY.marginRight,
    h: 0,
    decorative: true,
    semantic: 'decorative'
  });
  record({
    name: 'Footer identity',
    type: 'text',
    x: PPTX_GEOMETRY.marginLeft,
    y: PPTX_GEOMETRY.footerTextY,
    w: 4.4,
    h: PPTX_GEOMETRY.footerHeight,
    text: PPTX_BRAND.identity,
    foreground: PPTX_BRAND.colors.darkGray,
    background: PPTX_BRAND.colors.white,
    fontFace: PPTX_BRAND.fonts.body,
    fontSize: PPTX_TEXT.footer,
    semantic: 'footer'
  });
}

function createManifest(plan, { author, company }) {
  return {
    schema: 1,
    generator: 'Marin Learn PPTX exporter',
    presentation: {
      id: plan.presentationId,
      identifier: plan.presentationIdentifier,
      title: plan.title,
      subject: plan.subject,
      author,
      company,
      language: plan.language,
      filename: plan.filename
    },
    page: { width: PPTX_PAGE.width, height: PPTX_PAGE.height, aspectRatio: '16:9' },
    brand: {
      fonts: PPTX_BRAND.fonts,
      colors: PPTX_BRAND.colors
    },
    slides: []
  };
}
