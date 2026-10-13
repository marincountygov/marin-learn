// Marin Learn - structural and manifest validation for generated PowerPoint files
import { contrastRatio, normalizeHex, PPTX_BRAND, PPTX_PAGE } from './theme.js';

const XML_PART = /^ppt\/(slides|slideLayouts|slideMasters|notesSlides)\/.*\.xml$/;
const ADEC_NAMESPACE = 'http://schemas.microsoft.com/office/drawing/2017/decorative';

export async function validatePptx(bytes, runtime, manifest, { language = 'en-US' } = {}) {
  if (typeof runtime?.JSZip !== 'function') throw new Error('JSZip is unavailable for PowerPoint validation.');
  const errors = [];
  const warnings = [];
  const evidence = {
    slideParts: 0,
    notesParts: 0,
    titlePlaceholders: 0,
    titleTextMatches: 0,
    informativeImages: 0,
    decorativeObjects: 0,
    tables: 0,
    hyperlinks: 0,
    duplicateIdParts: 0,
    runLanguageMismatches: 0,
    automaticFitObjects: 0,
    explicitTypefaceElements: 0,
    explicitColorElements: 0,
    geometryElements: 0,
    widescreen: false
  };

  let zip;
  try {
    zip = await runtime.JSZip.loadAsync(bytes);
  } catch (error) {
    return failure('pptx-package-unreadable', `Generated PowerPoint could not be opened as an OOXML package: ${error.message}`, evidence);
  }

  const required = ['[Content_Types].xml', 'docProps/core.xml', 'ppt/presentation.xml'];
  for (const part of required) {
    if (!zip.file(part)) errors.push(issue('pptx-part-missing', `Generated PowerPoint is missing ${part}.`, { part }));
  }

  const core = zip.file('docProps/core.xml') ? await zip.file('docProps/core.xml').async('string') : '';
  const app = zip.file('docProps/app.xml') ? await zip.file('docProps/app.xml').async('string') : '';
  if (!new RegExp(`<dc:language>${escapeRegExp(language)}<\\/dc:language>`, 'i').test(core)) {
    errors.push(issue('pptx-language-missing', `Document language ${language} is not recorded in core properties.`));
  }
  const metadata = {
    title: xmlElementText(core, 'dc:title'),
    subject: xmlElementText(core, 'dc:subject'),
    creator: xmlElementText(core, 'dc:creator'),
    company: xmlElementText(app, 'Company')
  };
  for (const [field, value] of Object.entries(metadata)) {
    if (!value) errors.push(issue(`pptx-document-${field}-missing`, `Document ${field} metadata is missing.`));
  }
  if (manifest?.presentation) {
    const expected = {
      title: manifest.presentation.title,
      subject: manifest.presentation.subject,
      creator: manifest.presentation.author,
      company: manifest.presentation.company
    };
    for (const [field, value] of Object.entries(expected)) {
      const normalized = String(value || '').trim();
      if (normalized && metadata[field] !== normalized) {
        errors.push(issue(`pptx-document-${field}-mismatch`, `Document ${field} metadata does not match the export manifest.`, {
          expected: normalized,
          actual: metadata[field]
        }));
      }
    }
  }

  const presentationXml = zip.file('ppt/presentation.xml') ? await zip.file('ppt/presentation.xml').async('string') : '';
  const size = presentationXml.match(/<p:sldSz\b[^>]*\bcx=["'](\d+)["'][^>]*\bcy=["'](\d+)["']/i);
  if (size) {
    const ratio = Number(size[1]) / Number(size[2]);
    evidence.widescreen = Math.abs(ratio - (16 / 9)) < 0.001;
  }
  if (!evidence.widescreen) errors.push(issue('pptx-page-size-invalid', 'Generated PowerPoint is not widescreen 16:9.'));

  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(naturalPartSort);
  const notesNames = Object.keys(zip.files).filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
  evidence.slideParts = slideNames.length;
  evidence.notesParts = notesNames.length;

  if (manifest && slideNames.length !== manifest.slides.length) {
    errors.push(issue('pptx-slide-count-mismatch', `Expected ${manifest.slides.length} slide parts; found ${slideNames.length}.`));
  }
  const expectedNotes = manifest?.slides?.filter((slide) => String(slide.notes || '').trim()).length || 0;
  if (notesNames.length < expectedNotes) {
    errors.push(issue('pptx-notes-missing', `Expected notes for ${expectedNotes} slides; found ${notesNames.length} notes parts.`));
  }

  for (const name of Object.keys(zip.files).filter((part) => XML_PART.test(part))) {
    const xml = await zip.file(name).async('string');
    const ids = cNvPrElements(xml).map((element) => attributeValue(openingTag(element), 'id')).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      evidence.duplicateIdParts += 1;
      errors.push(issue('pptx-nonvisual-id-duplicate', `${name} contains duplicate nonvisual object IDs.`, { part: name }));
    }

    for (const element of cNvPrElements(xml)) {
      const open = openingTag(element);
      const objectName = decodeXml(attributeValue(open, 'name'));
      const description = decodeXml(attributeValue(open, 'descr'));
      if (objectName.startsWith('Decorative:')) {
        evidence.decorativeObjects += 1;
        if (!new RegExp(`<adec:decorative\\b[^>]*xmlns:adec=["']${escapeRegExp(ADEC_NAMESPACE)}["'][^>]*val=["']1["']`, 'i').test(element)) {
          errors.push(issue('pptx-decorative-marker-missing', `Decorative object “${objectName}” is not marked decorative in OOXML.`, { part: name, objectName }));
        }
        if (description || attributeValue(open, 'title')) {
          errors.push(issue('pptx-decorative-description-present', `Decorative object “${objectName}” retains alternate text.`, { part: name, objectName }));
        }
      } else if (objectName.startsWith('Informative image:')) {
        evidence.informativeImages += 1;
        if (!description) {
          errors.push(issue('pptx-image-alt-missing', `Informative image “${objectName}” has no alternate text.`, { part: name, objectName }));
        }
      }
      if (/^(data:|file:|\/|[A-Za-z]:\\|.*\/assets\/)/i.test(description || '')) {
        errors.push(issue('pptx-alt-text-path-leak', `Object “${objectName || '(unnamed)'}” exposes a local or encoded source path as alternate text.`, { part: name, objectName }));
      }
    }

    for (const tag of xml.match(/<a:tblPr\b[^>]*\/?>(?:[\s\S]*?<\/a:tblPr>)?/gi) || []) {
      evidence.tables += 1;
      if (attributeValue(openingTagAny(tag), 'firstRow') !== '1') {
        errors.push(issue('pptx-table-header-unmarked', `${name} contains a table without first-row header metadata.`, { part: name }));
      }
    }

    const automaticFitTags = xml.match(/<a:(?:normAutofit|spAutoFit)\b[^>]*\/?>(?:[\s\S]*?<\/a:(?:normAutofit|spAutoFit)>)?/gi) || [];
    if (automaticFitTags.length) {
      evidence.automaticFitObjects += automaticFitTags.length;
      errors.push(issue('pptx-automatic-fit-present', `${name} contains ${automaticFitTags.length} automatic text-fit instruction${automaticFitTags.length === 1 ? '' : 's'}; Marin Learn requires fixed presentation typography and preflight overflow handling.`, { part: name, count: automaticFitTags.length }));
    }

    const allowedFonts = new Set([PPTX_BRAND.fonts.heading, PPTX_BRAND.fonts.body]);
    const partFonts = new Set();
    for (const tag of xml.match(/<a:latin\b[^>]*\/?>/gi) || []) {
      const face = decodeXml(attributeValue(tag, 'typeface')).trim();
      if (!face || face.startsWith('+')) continue;
      evidence.explicitTypefaceElements += 1;
      if (!allowedFonts.has(face)) partFonts.add(face);
    }
    for (const face of partFonts) {
      errors.push(issue('pptx-font-unapproved-ooxml', `${name} contains the unapproved explicit typeface ${face}.`, { part: name, fontFace: face }));
    }

    const allowedColors = new Set(Object.values(PPTX_BRAND.colors).map(normalizeHex));
    const partColors = new Set();
    for (const tag of xml.match(/<a:srgbClr\b[^>]*\/?>/gi) || []) {
      const raw = attributeValue(tag, 'val');
      if (!raw) continue;
      const color = normalizeHex(raw);
      evidence.explicitColorElements += 1;
      if (!allowedColors.has(color)) partColors.add(color);
    }
    for (const color of partColors) {
      errors.push(issue('pptx-color-unapproved-ooxml', `${name} contains the unapproved explicit color #${color}.`, { part: name, color }));
    }

    const languageTags = xml.match(/<a:(?:rPr|endParaRPr|defRPr)\b[^>]*\/?>(?:[\s\S]*?<\/a:(?:rPr|endParaRPr|defRPr)>)?/gi) || [];
    for (const tag of languageTags) {
      if (attributeValue(openingTagAny(tag), 'lang') !== language) evidence.runLanguageMismatches += 1;
    }
  }
  if (evidence.runLanguageMismatches) {
    errors.push(issue('pptx-run-language-mismatch', `${evidence.runLanguageMismatches} text property elements do not declare ${language}.`));
  }

  for (const [index, name] of slideNames.entries()) {
    const xml = await zip.file(name).async('string');
    const titleShapes = titlePlaceholderShapes(xml);
    evidence.titlePlaceholders += titleShapes.length;
    if (titleShapes.length !== 1) {
      errors.push(issue('pptx-slide-title-placeholder', `${name} contains ${titleShapes.length} title placeholders; exactly one is required.`, { part: name }));
    } else if (manifest?.slides?.[index]) {
      const actualTitle = shapeText(titleShapes[0]);
      const expectedTitle = String(manifest.slides[index].title || '').trim();
      if (actualTitle === expectedTitle) evidence.titleTextMatches += 1;
      else errors.push(issue('pptx-slide-title-mismatch', `${name} title does not match the export manifest.`, {
        part: name,
        expected: expectedTitle,
        actual: actualTitle
      }));
    }
    evidence.hyperlinks += (xml.match(/<a:hlinkClick\b/g) || []).length;
  }

  if (manifest) validateManifest(manifest, errors, warnings, evidence);

  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    warnings,
    evidence
  };
}

export function validateManifest(manifest, errors = [], warnings = [], evidence = {}) {
  const allowedFonts = new Set([PPTX_BRAND.fonts.heading, PPTX_BRAND.fonts.body]);
  const allowedColors = new Set(Object.values(PPTX_BRAND.colors).map(normalizeHex));
  for (const slide of manifest?.slides || []) {
    for (const element of slide.elements || []) {
      evidence.geometryElements = (evidence.geometryElements || 0) + 1;
      const geometry = ['x', 'y', 'w', 'h'].every((key) => Number.isFinite(Number(element[key])));
      if (geometry) {
        const x = Number(element.x);
        const y = Number(element.y);
        const w = Number(element.w);
        const h = Number(element.h);
        if (x < -0.001 || y < -0.001 || x + w > PPTX_PAGE.width + 0.001 || y + h > PPTX_PAGE.height + 0.001) {
          errors.push(issue('pptx-element-out-of-bounds', `Slide ${slide.number} object “${element.name}” extends outside the slide canvas.`, { slide: slide.number, element: element.name }));
        }
      }
      if (element.type === 'text') {
        if (element.fontFace && !allowedFonts.has(element.fontFace)) {
          errors.push(issue('pptx-font-unapproved', `Slide ${slide.number} object “${element.name}” uses unapproved font ${element.fontFace}.`, { slide: slide.number, element: element.name }));
        }
        for (const field of ['foreground', 'background']) {
          const rawColor = element[field];
          if (rawColor && !allowedColors.has(normalizeHex(rawColor))) {
            errors.push(issue('pptx-color-unapproved', `Slide ${slide.number} object “${element.name}” uses unapproved ${field} color #${normalizeHex(rawColor)}.`, { slide: slide.number, element: element.name, field, color: normalizeHex(rawColor) }));
          }
        }
        if (Number(element.fontSize) < 12 && element.semantic !== 'footer') {
          errors.push(issue('pptx-font-too-small', `Slide ${slide.number} object “${element.name}” uses text smaller than 12 pt.`, { slide: slide.number, element: element.name }));
        }
        if (element.foreground && element.background) {
          const foreground = normalizeHex(element.foreground);
          const background = normalizeHex(element.background);
          if (allowedColors.has(foreground) && allowedColors.has(background)) {
            const ratio = contrastRatio(foreground, background);
            const threshold = Number(element.fontSize) >= 18 || (Number(element.fontSize) >= 14 && element.bold) ? 3 : 4.5;
            if (ratio + 0.001 < threshold) {
              errors.push(issue('pptx-contrast-failure', `Slide ${slide.number} object “${element.name}” has contrast ${ratio.toFixed(2)}:1; at least ${threshold}:1 is required.`, { slide: slide.number, element: element.name, ratio, threshold }));
            }
          }
        }
      }
    }
    validateSevereOverlaps(slide, errors);
  }
  return { errors, warnings, evidence };
}

function validateSevereOverlaps(slide, errors) {
  const elements = (slide.elements || []).filter((element) => (
    !element.decorative &&
    element.semantic !== 'footer' &&
    Number(element.w) > 0.05 &&
    Number(element.h) > 0.05
  ));
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      const first = elements[i];
      const second = elements[j];
      if (first.semantic === 'slide-title-placeholder' || second.semantic === 'slide-title-placeholder') continue;
      const area = intersectionArea(first, second);
      const minimum = Math.min(Number(first.w) * Number(first.h), Number(second.w) * Number(second.h));
      if (minimum > 0 && area / minimum > 0.45) {
        errors.push(issue('pptx-element-overlap', `Slide ${slide.number} objects “${first.name}” and “${second.name}” substantially overlap.`, {
          slide: slide.number,
          first: first.name,
          second: second.name
        }));
      }
    }
  }
}

function intersectionArea(first, second) {
  const left = Math.max(Number(first.x), Number(second.x));
  const top = Math.max(Number(first.y), Number(second.y));
  const right = Math.min(Number(first.x) + Number(first.w), Number(second.x) + Number(second.w));
  const bottom = Math.min(Number(first.y) + Number(first.h), Number(second.y) + Number(second.h));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function titlePlaceholderShapes(xml) {
  return (String(xml || '').match(/<p:sp\b[\s\S]*?<\/p:sp>/gi) || [])
    .filter((shape) => /<p:ph\b[^>]*\btype=["']title["']/i.test(shape));
}

function shapeText(shape) {
  return [...String(shape || '').matchAll(/<a:t>([\s\S]*?)<\/a:t>/gi)]
    .map((match) => decodeXml(match[1]))
    .join('')
    .trim();
}

function xmlElementText(xml, qualifiedName) {
  const match = String(xml || '').match(new RegExp(`<${escapeRegExp(qualifiedName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(qualifiedName)}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function cNvPrElements(xml) {
  return String(xml || '').match(/<p:cNvPr\b[^>]*\/>|<p:cNvPr\b[^>]*>[\s\S]*?<\/p:cNvPr>/gi) || [];
}

function openingTag(element) {
  return String(element).match(/^<p:cNvPr\b[^>]*\/?>(?=|[\s\S])/i)?.[0] || '';
}

function openingTagAny(element) {
  return String(element).match(/^<[^>]+>/)?.[0] || '';
}

function attributeValue(tag, name) {
  const match = String(tag).match(new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? match[2] : null;
}

function naturalPartSort(first, second) {
  return Number(first.match(/(\d+)\.xml$/)?.[1] || 0) - Number(second.match(/(\d+)\.xml$/)?.[1] || 0);
}

function issue(code, message, details = {}) {
  return { severity: 'error', code, message, ...details };
}

function failure(code, message, evidence) {
  return { status: 'fail', errors: [issue(code, message)], warnings: [], evidence };
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
