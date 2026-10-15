// Marin Learn - Turn a Note section into Markdown so the existing slide pipeline
// (HTML slides and PowerPoint export) can show it without a second code path.
import { itemText } from './note.js';

function esc(text) {
  return String(text ?? '').replace(/([\\`*_{}\[\]<>|#~])/g, '\\$1');
}

function cell(text) {
  return esc(text).replace(/\s+/g, ' ');
}

function link(item) {
  return `[${esc(item.title)}](${String(item.url).replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
}

// A fenced block whose fence is longer than any run of backticks in the code.
function codeBlock(sample) {
  const longest = Math.max(0, ...(String(sample.code).match(/`+/g) || []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `**${esc(sample.title)}**\n\n${fence}${sample.language ? String(sample.language).replace(/\s+/g, '') : ''}\n${sample.code}\n${fence}`;
}

// `range` is { first, last } (1-based) or null for the whole section.
export function noteSectionMarkdown(section, range = null, codeRange = null) {
  const type = section?.['marin:sectionType'];
  if (typeof section?.['marin:text'] === 'string') return esc(section['marin:text']);

  const all = section?.['marin:items'] || [];
  const first = range ? Math.max(1, range.first) : 1;
  const items = range ? all.slice(first - 1, range.last) : all;

  switch (type) {
    case 'keyTerms':
      return items.map((item) => `- **${esc(item.term)}:** ${esc(item.definition)}`).join('\n');
    case 'dosAndDonts':
      return ['| Do | Don’t |', '| --- | --- |', ...items.map((item) => `| ${cell(item.do)} | ${cell(item.dont)} |`)].join('\n');
    case 'questions':
      return items.map((item, index) => `${first + index}. ${esc(item)}`).join('\n');
    case 'examples': {
      // No range: links and all code. A range on either part shows only the chosen parts.
      const samples = section['marin:code'] || [];
      const all = !range && !codeRange;
      const links = (all || range) ? items.map((item) => `- ${link(item)}`).join('\n') : '';
      const code = (all ? samples : codeRange ? samples.slice(Math.max(1, codeRange.first) - 1, codeRange.last) : []).map(codeBlock);
      // Code comes first: the Markdown profile's list parser swallows any paragraph or
      // fence that follows a list, so a list has to be the last block.
      return [...code, links].filter(Boolean).join('\n\n');
    }
    case 'learnMore':
      return items.map((item) => `- ${link(item)}`).join('\n');
    default:
      return items.map((item) => `- ${esc(typeof item === 'string' ? item : itemText(item))}`).join('\n');
  }
}
