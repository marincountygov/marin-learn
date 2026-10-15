// Marin Learn - Note rules shared by the validator, the viewer, and (later) the editor.
// A Note is a short, structured brief made of twelve sections (see NOTE_SECTIONS).
import { NOTE_SECTIONS, NOTE_TARGET_GRADE } from './constants.js';

export function characterCount(text) {
  return [...String(text ?? '')].length;
}

export function noteSectionRule(type) {
  return NOTE_SECTIONS.find((section) => section.type === type) || null;
}

// The text a reader sees for one item, whatever its shape.
export function itemText(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  if ('term' in item) return `${item.term}. ${item.definition}`;
  if ('do' in item) return `Do: ${item.do}. Don't: ${item.dont}`;
  return item.title || '';
}

export function sectionText(section) {
  if (!section) return '';
  if (typeof section['marin:text'] === 'string') return section['marin:text'];
  return (section['marin:items'] || []).map(itemText).join(' ');
}

// About 200 words per minute, at least one minute.
export function readingMinutes(sections) {
  const words = sections.map(sectionText).join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function syllables(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return 0;
  if (cleaned.length <= 3) return 1;
  const groups = cleaned.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

// Flesch-Kincaid grade level for plain text. Returns null when there is too
// little text to be meaningful.
export function readingGrade(text) {
  const sentences = String(text || '').split(/[.!?]+(?:\s|$)/).map((part) => part.trim()).filter(Boolean);
  const words = String(text || '').match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  if (words.length < 20 || !sentences.length) return null;
  const syllableCount = words.reduce((total, word) => total + syllables(word), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syllableCount / words.length) - 15.59;
}

// Title case such as "Data Is A Public Trust": most words after the first start
// with a capital. Acronyms and a few proper nouns are ignored.
export function looksLikeTitleCase(text) {
  const words = String(text || '').split(/\s+/).filter((word) => /^[A-Za-z]/.test(word)).slice(1);
  const counted = words.filter((word) => word.length > 3 && !/^[A-Z0-9]+$/.test(word) && !/^(MarinOS|County|Marin|Learn)/.test(word));
  if (counted.length < 3) return false;
  return counted.filter((word) => /^[A-Z]/.test(word)).length / counted.length >= 0.8;
}

// Advice, never blocking: reading level, and sentence case in the Note title.
// Link titles are not checked because they often hold proper names.
export function lintNote(note, sections) {
  const advice = [];
  if (looksLikeTitleCase(note.name)) advice.push({ code: 'note-sentence-case', message: `The Note title “${note.name}” should use sentence case.`, field: 'name' });
  for (const section of sections) {
    const type = section['marin:sectionType'];
    const rule = noteSectionRule(type);
    // Link sections hold names of documents, so a reading grade means nothing there.
    const grade = rule?.link ? null : readingGrade(sectionText(section));
    if (grade !== null && grade > NOTE_TARGET_GRADE + 1) {
      advice.push({ code: 'note-reading-level', message: `${rule?.label || type} reads at about grade ${Math.round(grade)}. Aim for grade ${NOTE_TARGET_GRADE} or lower: shorter sentences and common words.`, field: type });
    }
  }
  return advice;
}
