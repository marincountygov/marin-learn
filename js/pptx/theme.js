// Marin Learn - PowerPoint brand and layout constants

export const PPTX_BRAND = Object.freeze({
  colors: Object.freeze({
    blue: '0777CF',
    darkGray: '6F6F6F',
    lightGray: 'A9A9A9',
    red: 'B45340',
    green: '73784A',
    brown: 'A2662B',
    black: '000000',
    gold: 'E5B53B',
    white: 'FFFFFF',
    paleBlue: 'EAF4FC',
    paleGray: 'F3F3F3'
  }),
  fonts: Object.freeze({
    heading: 'Jost',
    body: 'Open Sans'
  }),
  identity: 'County of Marin · Marin Learn'
});

export const PPTX_PAGE = Object.freeze({
  width: (7.5 / 9) * 16,
  height: 7.5,
  layoutName: 'MARIN_LEARN_WIDE'
});

export const PPTX_GEOMETRY = Object.freeze({
  marginLeft: 0.72,
  marginRight: 0.72,
  titleTop: 0.28,
  titleHeight: 0.68,
  contentTop: 1.18,
  contentBottom: 6.72,
  footerRuleY: 6.92,
  footerTextY: 7.03,
  footerHeight: 0.22,
  contentGap: 0.22,
  columnGap: 0.36
});

export const PPTX_TEXT = Object.freeze({
  title: 28,
  titleHero: 38,
  titleSection: 34,
  entryHeading: 19,
  body: 18,
  list: 17,
  quote: 27,
  code: 15,
  table: 14,
  footer: 9,
  minimumBody: 16,
  minimumTable: 12
});

export function normalizeHex(value) {
  return String(value || '').replace(/^#/, '').toUpperCase().padStart(6, '0').slice(0, 6);
}

export function relativeLuminance(hex) {
  const value = normalizeHex(hex);
  const channels = [0, 2, 4]
    .map((start) => Number.parseInt(value.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
