import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, rowHeightForWidth } from '../src/placement.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveLayouts } from '../src/geometry.mjs';
import { serializePlacement } from '../src/serialization.mjs';
import { responsiveRowMetrics } from '../src/section-layout.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const source = { column: 5, row: 3, columnSpan: 8, rowSpan: 6, gridColumns: 24 };
function geometry(width) {
  const padding = { top: 0, bottom: 0, left: 24, right: 24 };
  const inset = Math.max(24, (width - 1200) / 2);
  const all = Object.fromEntries(Object.entries(COLUMNS).map(([mode, count]) => [mode, {
    ...canvasColumns(width, padding, inset, width - inset, 12, mode, count),
    ...canvasRows(0, 0, 20, 12, rowHeightForWidth(width - 48, mode)),
    gap: 12, viewport: mode, align: 'full', referenceWidth: 1248, referenceColumns: 24,
  }]));
  for (const mode of Object.keys(all)) all[mode] = responsiveRowMetrics([], mode, all);
  return all;
}

test('all named edge attachments translate frames without changing their dimensions', () => {
  for (const width of [390, 1000, 1920, 2560]) for (const free of [undefined, { x: .2, y: 2, width: .3, ratio: 1.5 }]) {
    const g = geometry(width).desktop;
    const base = { ...source, free };
    const unanchored = mapCanvasPlacement(base, 'desktop', g)._rect;
    for (const edge of ['left', 'right']) for (const name of ['canvas', 'padding', 'wide']) {
      const p = mapCanvasPlacement({ ...base, anchors: { [edge]: name } }, 'desktop', g)._rect;
      close(p.width, unanchored.width);
      close(p.height, unanchored.height);
      close(p.top, unanchored.top);
      const target = name === 'canvas' ? [0, width] : name === 'wide' ? [g.wideStart, g.wideEnd] : [24, width - 24];
      close(edge === 'left' ? p.left : p.left + p.width, target[edge === 'left' ? 0 : 1]);
    }
  }
});

test('contained compositions retain single wide attachments', () => {
  const g = { ...geometry(2560).desktop, align: 'wide' };
  for (const free of [undefined, { x: .2, y: 2, width: .3, ratio: 1.5 }]) {
    for (const edge of ['left', 'right']) {
      const p = mapCanvasPlacement({ ...source, free, anchors: { [edge]: 'wide' } }, 'desktop', g)._rect;
      close(edge === 'left' ? p.left : p.left + p.width, edge === 'left' ? g.wideStart : g.wideEnd);
    }
  }
});

test('two named edges stretch width only and all block kinds resolve the same saved frame', () => {
  for (const width of [390, 600, 1000, 1920, 2560]) for (const free of [undefined, { x: .2, y: 2, width: .3, ratio: 1.5 }]) {
    const all = geometry(width), mode = width <= 480 ? 'mobile' : width <= 782 ? 'tablet' : 'desktop';
    for (const anchors of [{ left: 'canvas', right: 'canvas' }, { left: 'wide', right: 'wide' }, { left: 2, right: 'canvas' }]) {
      const desktop = { ...source, free, anchors, frameRatio: 3 };
      const plain = mapCanvasPlacement({ ...source, free }, 'desktop', all.desktop)._rect;
      const anchored = mapCanvasPlacement(desktop, 'desktop', all.desktop)._rect;
      close(anchored.height, plain.height);
      close(anchored.top, plain.top);
      const blocks = ['core/heading', 'core/image', 'core/video'].map((name, i) => ({ clientId: String(i), name,
        attributes: { canvas: { fill: true, desktop: JSON.parse(JSON.stringify(serializePlacement(desktop))) } } }));
      const layouts = resolveLayouts(blocks, all);
      for (const id of ['1', '2']) for (const key of ['left', 'top', 'width', 'height']) {
        close(layouts[id][mode]._rect[key], layouts['0'][mode]._rect[key]);
      }
    }
  }
});
