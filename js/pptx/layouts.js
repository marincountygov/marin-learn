// Marin Learn - PowerPoint slide layout rules and geometry
import { PPTX_GEOMETRY, PPTX_PAGE } from './theme.js';

const BODY_WIDTH = PPTX_PAGE.width - PPTX_GEOMETRY.marginLeft - PPTX_GEOMETRY.marginRight;
const BODY_HEIGHT = PPTX_GEOMETRY.contentBottom - PPTX_GEOMETRY.contentTop;

export const PPTX_LAYOUT_RULES = Object.freeze({
  title: Object.freeze({ minContent: 0, maxContent: 1, master: 'MARIN_TITLE' }),
  section: Object.freeze({ minContent: 0, maxContent: 1, master: 'MARIN_SECTION' }),
  content: Object.freeze({ minContent: 1, maxContent: Infinity, master: 'MARIN_STANDARD' }),
  split: Object.freeze({ minContent: 1, maxContent: 2, master: 'MARIN_STANDARD' }),
  media: Object.freeze({ minContent: 1, maxContent: 1, master: 'MARIN_STANDARD' }),
  quote: Object.freeze({ minContent: 1, maxContent: 1, master: 'MARIN_STANDARD' })
});

export function baseBodyArea() {
  return {
    x: PPTX_GEOMETRY.marginLeft,
    y: PPTX_GEOMETRY.contentTop,
    w: BODY_WIDTH,
    h: BODY_HEIGHT
  };
}

export function titleSupportArea(layout) {
  if (layout === 'section') return { x: 1.3, y: 3.62, w: PPTX_PAGE.width - 2.6, h: 1.25 };
  return { x: 1.15, y: 3.22, w: PPTX_PAGE.width - 2.3, h: 1.35 };
}

export function splitAreas(contentCount) {
  const body = baseBodyArea();
  if (contentCount <= 1) return [body];
  const width = (body.w - PPTX_GEOMETRY.columnGap) / 2;
  return [
    { x: body.x, y: body.y, w: width, h: body.h },
    { x: body.x + width + PPTX_GEOMETRY.columnGap, y: body.y, w: width, h: body.h }
  ];
}

export function mediaAreas(hasImages) {
  const body = baseBodyArea();
  if (!hasImages) {
    return {
      text: { x: body.x, y: body.y, w: 7.2, h: body.h },
      media: { x: 8.55, y: 1.42, w: 3.95, h: 4.95 },
      fallback: true
    };
  }
  return {
    text: { x: body.x, y: body.y, w: 6.32, h: body.h },
    media: { x: 7.28, y: 1.34, w: 5.3, h: 5.12 },
    fallback: false
  };
}

export function quoteArea() {
  return { x: 1.15, y: 1.65, w: PPTX_PAGE.width - 2.3, h: 4.35 };
}

export function allocateVerticalAreas(measuredHeights, gap = PPTX_GEOMETRY.contentGap) {
  const body = baseBodyArea();
  const areas = [];
  let y = body.y;
  for (const height of measuredHeights) {
    areas.push({ x: body.x, y, w: body.w, h: height });
    y += height + gap;
  }
  return {
    areas,
    requiredHeight: measuredHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, measuredHeights.length - 1) * gap,
    availableHeight: body.h
  };
}
