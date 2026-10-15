// Marin Learn - Build a slide deck from a Note.
//
// A deck is a list of slides that point at the Note's sections (and ranges of their
// items). The deck never copies Note text, so editing the Note updates the deck.
// Building is deterministic: the same Note and options give the same slides and IDs.
import { NOTE_SECTIONS } from './constants.js';
import { itemText } from './note.js';
import { ref } from './utils.js';

export const DECK_DEFAULTS = Object.freeze({
  wordBudget: 45,
  // Sections that always stay on one slide, whatever the word budget.
  keepTogether: Object.freeze(['checklist', 'userStories', 'questions']),
  // Most slides a section may use. Beyond what the word budget gives, items are spread evenly.
  maxSlides: Object.freeze({ keyTerms: 3 }),
  // Most items on one slide, by section, even when the words would fit.
  itemCaps: Object.freeze({ keyTerms: 4, dosAndDonts: 4, default: 6 })
});

const countWords = (text) => String(text ?? '').split(/\s+/).filter(Boolean).length;
const labelFor = (type) => NOTE_SECTIONS.find((rule) => rule.type === type)?.label || type;

// Split a section's items into 1-based ranges that fit the word budget and the item cap.
// A greedy pass finds how many slides are needed; then the items are spread evenly
// across that many slides, so the last slide is not left with one stray item. If an
// even spread would break the budget, the greedy split is used. The first item on a
// slide is always accepted, so one long item still gets a slide.
export function chunkItems(items, wordBudget, cap, maxSlides = Infinity) {
  const wordsOf = (item) => countWords(itemText(item));
  const greedy = [];
  let first = 1;
  let words = 0;
  let count = 0;
  items.forEach((item, index) => {
    const itemWords = wordsOf(item);
    if (count > 0 && (words + itemWords > wordBudget || count >= cap)) {
      greedy.push({ first, last: index });
      first = index + 1;
      words = 0;
      count = 0;
    }
    words += itemWords;
    count += 1;
  });
  if (count > 0) greedy.push({ first, last: items.length });
  if (greedy.length < 2) return greedy;

  // Never more slides than allowed: spread the items over that many, even if the
  // word budget is then exceeded.
  const slides = Math.min(greedy.length, maxSlides);
  const base = Math.floor(items.length / slides);
  const extra = items.length % slides;
  const even = [];
  let start = 1;
  for (let index = 0; index < slides; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    even.push({ first: start, last: start + size - 1 });
    start += size;
  }
  const fits = slides < greedy.length || even.every((range) => {
    const size = range.last - range.first + 1;
    const total = items.slice(range.first - 1, range.last).reduce((sum, item) => sum + wordsOf(item), 0);
    return size === 1 || (size <= cap && total <= wordBudget);
  });
  return fits ? even : greedy;
}

const titled = (label, index, total) => (total > 1 ? `${label} (${index + 1} of ${total})` : label);

// The slides to build: [{ key, name, layout, entries: [{ section, range?, codeRange? }] }].
// `sections` are the Note's non-empty sections in reading order.
export function planNoteDeck(note, sections, options = {}) {
  const budget = options.wordBudget ?? DECK_DEFAULTS.wordBudget;
  const caps = { ...DECK_DEFAULTS.itemCaps, ...(options.itemCaps || {}) };
  const byType = new Map(sections.map((section) => [section['marin:sectionType'], section]));
  const plan = [{ key: 'title', name: note.name, layout: 'title', entries: [] }];

  for (const section of sections) {
    const type = section['marin:sectionType'];
    const label = labelFor(type);
    if (type === 'solution' && byType.has('problem')) continue; // shown beside Problem

    if (type === 'problem' && byType.has('solution')) {
      plan.push({ key: 'problem-solution', name: 'Problem and solution', layout: 'split', entries: [{ section }, { section: byType.get('solution') }] });
      continue;
    }

    if (typeof section['marin:text'] === 'string') {
      plan.push({ key: type, name: label, layout: 'content', entries: [{ section }] });
      continue;
    }

    const items = section['marin:items'] || [];
    const samples = section['marin:code'] || [];

    if (type === 'mantras') {
      // The quote layout reads as one large quotation, which suits a list of mantras
      // poorly in the viewer, so mantras use the content layout.
      plan.push({ key: type, name: label, layout: 'content', entries: [{ section }] });
      continue;
    }
    if (type === 'learnMore') {
      plan.push({ key: type, name: label, layout: 'content', entries: [{ section }] });
      continue;
    }

    if (type === 'examples') {
      if (items.length) {
        // A range on the links keeps the code samples off this slide.
        const parts = chunkItems(items, budget, caps.default);
        parts.forEach((range, index) => plan.push({
          key: `examples-links-${index + 1}`, name: titled(label, index, parts.length), layout: 'content', entries: [{ section, range: samples.length || parts.length > 1 ? range : undefined }]
        }));
      }
      samples.forEach((sample, index) => plan.push({
        key: `examples-code-${index + 1}`, name: titled('Code', index, samples.length), layout: 'content', entries: [{ section, codeRange: { first: index + 1, last: index + 1 } }]
      }));
      continue;
    }

    const together = (options.keepTogether ?? DECK_DEFAULTS.keepTogether).includes(type);
    const most = { ...DECK_DEFAULTS.maxSlides, ...(options.maxSlides || {}) }[type];
    const parts = together && items.length ? [{ first: 1, last: items.length }] : chunkItems(items, budget, caps[type] ?? caps.default, most);
    parts.forEach((range, index) => plan.push({
      key: `${type}-${index + 1}`, name: titled(label, index, parts.length), layout: 'content', entries: [{ section, range: parts.length > 1 ? range : undefined }]
    }));
  }
  return plan;
}

// Slide graph objects for a plan. `makeId(key)` must return a stable urn:uuid for a key.
export function buildSlides(note, plan, makeId) {
  const base = note.identifier || 'note';
  return plan.map((spec, index) => {
    const slide = {
      '@id': makeId(`slide/${spec.key}`),
      '@type': ['CreativeWork', 'marin:Slide'],
      identifier: `${base}-slide-${String(index + 1).padStart(2, '0')}`,
      name: spec.name,
      'marin:layout': spec.layout
    };
    if (spec.entries.length) {
      slide['marin:contentSequence'] = {
        '@type': 'ItemList',
        itemListElement: spec.entries.map((entry, position) => ({
          '@type': 'ListItem',
          position: position + 1,
          item: ref(entry.section['@id']),
          'marin:displayMode': 'full',
          ...(entry.range ? { 'marin:itemRange': entry.range } : {}),
          ...(entry.codeRange ? { 'marin:codeRange': entry.codeRange } : {})
        }))
      };
    }
    return slide;
  });
}

// Replace a deck's slides with slides built from the Note. Edits graphDocument in place.
// The deck keeps its @id; its old slides are removed; the learning set's membership
// list is refreshed. Returns the new slide objects.
export function applyNoteDeck(graphDocument, { noteId, presentationId, abstract, name, makeId, options = {} }) {
  const graph = graphDocument['@graph'];
  const byId = new Map(graph.map((object) => [object['@id'], object]));
  const note = byId.get(noteId);
  if (!note) throw new Error(`No Note ${noteId} in the graph.`);
  const deck = byId.get(presentationId);
  if (!deck) throw new Error(`No presentation ${presentationId} in the graph.`);

  const sections = (note['marin:sectionSequence']?.itemListElement || [])
    .map((entry) => byId.get(entry.item?.['@id']))
    .filter(Boolean)
    .filter((section) => (typeof section['marin:text'] === 'string' ? section['marin:text'].trim() : (section['marin:items'] || []).length || (section['marin:code'] || []).length));

  const oldSlides = new Set((deck['marin:slideSequence']?.itemListElement || []).map((entry) => entry.item?.['@id']));
  const slides = buildSlides(note, planNoteDeck(note, sections, options), makeId);
  const kept = graph.filter((object) => !oldSlides.has(object['@id']) && !slides.some((slide) => slide['@id'] === object['@id']));
  graph.splice(0, graph.length, ...kept, ...slides);

  deck.isBasedOn = [ref(noteId)];
  if (abstract) deck.abstract = abstract;
  if (name) deck.name = name;
  deck['marin:slideSequence'] = {
    '@type': 'ItemList',
    itemListElement: slides.map((slide, index) => ({ '@type': 'ListItem', position: index + 1, item: ref(slide['@id']) }))
  };

  const root = graph.find((object) => (Array.isArray(object['@type']) ? object['@type'] : [object['@type']]).includes('marin:LearningSet'));
  if (root?.hasPart) root.hasPart = graph.filter((object) => object['@id'] !== root['@id']).map((object) => ref(object['@id']));
  return slides;
}
