import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, dragMovePlacement, dragResizePlacement, snapCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';

const minimum = { columnSpan: 1, rowSpan: 1 };
const near = (a, b) => assert.ok(Math.abs(a - b) < .0001, `${a} != ${b}`);
const geometry = (mode, padding = 40) => {
  const width = { desktop: 1800, tablet: 800, mobile: 390 }[mode];
  return { ...canvasColumns(width, { left: padding, right: padding, top: 24, bottom: 24 },
    Math.max(padding, (width - 1200) / 2), Math.min(width - padding, (width + 1200) / 2), 12, mode, undefined, { left: Math.max(padding, (width - 1200) / 2), right: Math.max(padding, (width - 1200) / 2) }),
    ...canvasRows(24, 24, 20, 12), gap: 12 };
};
function cellEdges(p) {
  assert.ok(p._canvas.columns.some(c => Math.abs(c.start - p._rect.left) < .0001), 'left edge must land on a cell');
  assert.ok(p._canvas.columns.some(c => Math.abs(c.end - p._rect.left - p._rect.width) < .0001), 'right edge must land on a cell');
  assert.equal(savedCanvasPlacement(p).free, undefined);
  assert.deepEqual(mapCanvasPlacement(JSON.parse(JSON.stringify(savedCanvasPlacement(p))), p._canvas.viewport || 'desktop', p._canvas)._rect, p._rect);
}

test('cells and gutters remain uniform through the center and meet the wide boundaries', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const padding of [0, 24, 60]) {
    const g = geometry(mode, padding), size = g.contentColumns[0].end - g.contentColumns[0].start;
    const gap = g.contentColumns[1].start - g.contentColumns[0].end;
    near(g.contentColumns[0].start, g.wideStart);
    near(g.contentColumns.at(-1).end, g.wideEnd);
    g.contentColumns.forEach((c, i) => {
      near(c.end - c.start, size);
      if (i) near(c.start - g.contentColumns[i - 1].end, gap);
      near(c.start + g.contentColumns.at(-1 - i).end, g.width);
    });
    near((g.contentColumns[g.gridColumns / 2 - 1].end + g.contentColumns[g.gridColumns / 2].start) / 2, g.center);
    assert.ok(gap > 0, 'the middle gutter must not collapse');
  }
});

test('center drops select centered cells, including odd spans, and reopen exactly', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const columnSpan of Array.from({ length: geometry(mode).gridColumns }, (_, i) => i + 1)) for (const distance of [-5, 0, 5]) {
    const g = { ...geometry(mode), viewport: mode };
    const start = mapCanvasPlacement({ column: 2, columnSpan, row: 3, rowSpan: 3 }, mode, g);
    const moved = dragMovePlacement(start, mode, g.width / 2 - start._rect.left - start._rect.width / 2 + distance, 36, minimum);
    const drop = snapCanvasPlacement(moved, mode, minimum, start);
    near(drop._rect.left + drop._rect.width / 2, g.width / 2);
    cellEdges(drop);
  }
});

test('moves and resizes stay on cells when an edge is near the center gutter', () => {
  const g = { ...geometry('desktop'), viewport: 'desktop' };
  for (const side of ['left', 'right']) for (const distance of [-5, 0, 5]) {
    const start = mapCanvasPlacement({ column: side === 'left' ? 20 : 2, columnSpan: 2, row: 3, rowSpan: 3 }, 'desktop', g);
    const edge = r => r.left + (side === 'right' ? r.width : 0);
    const dx = g.center + distance - edge(start._rect);
    const move = snapCanvasPlacement(dragMovePlacement(start, 'desktop', dx, 36, minimum), 'desktop', minimum, start);
    cellEdges(move);
    assert.ok(Math.abs(edge(move._rect) - g.center) > .1);
    const resize = snapCanvasPlacement(dragResizePlacement(start, 'desktop', side === 'left' ? 'w' : 'e', dx, 0, minimum), 'desktop', minimum);
    cellEdges(resize);
    assert.ok(Math.abs(edge(resize._rect) - g.center) > .1);
  }
});

test('wide guides preserve exact cell boundaries during moves and resizing', () => {
  const g = { ...geometry('desktop'), viewport: 'desktop' };
  for (const [side, target] of [['left', g.wideStart], ['right', g.wideEnd]]) for (const distance of [-5, 0, 5]) {
    const start = mapCanvasPlacement({ column: side === 'left' ? 8 : 2, columnSpan: 2, row: 3, rowSpan: 3 }, 'desktop', g);
    const edge = r => r.left + (side === 'right' ? r.width : 0);
    const dx = target + distance - edge(start._rect);
    const move = snapCanvasPlacement(dragMovePlacement(start, 'desktop', dx, 36, minimum), 'desktop', minimum, start);
    near(edge(move._rect), target);
    cellEdges(move);
    const resize = snapCanvasPlacement(dragResizePlacement(start, 'desktop', side === 'left' ? 'w' : 'e', dx, 0, minimum), 'desktop', minimum);
    near(edge(resize._rect), target);
    cellEdges(resize);
  }
});

test('uneven padding retains centered cell spans and exact wide boundaries', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    const initial = geometry(mode), width = initial.width;
    const g = { ...initial, ...canvasColumns(width, { left: 24, right: 60, top: 24, bottom: 24 }, 24, width - 60, 12, mode), viewport: mode };
    const start = mapCanvasPlacement({ column: 2, columnSpan: 3, row: 3, rowSpan: 3 }, mode, g);
    const next = snapCanvasPlacement(dragMovePlacement(start, mode, g.center - start._rect.left - start._rect.width / 2, 36, minimum), mode, minimum, start);
    near(next._rect.left + next._rect.width / 2, g.center);
    cellEdges(next);
    near(g.contentColumns[0].start, 24);
    near(g.contentColumns.at(-1).end, width - 60);
  }
});

test('resizing to a centered span also ends on cells', () => {
  const g = { ...geometry('desktop'), viewport: 'desktop' };
  const start = mapCanvasPlacement({ column: 6, columnSpan: 4, row: 3, rowSpan: 3 }, 'desktop', g);
  const dx = g.width - 2 * start._rect.left - start._rect.width + 3;
  const next = snapCanvasPlacement(dragResizePlacement(start, 'desktop', 'e', dx, 0, minimum), 'desktop', minimum);
  near(next._rect.left + next._rect.width / 2, g.width / 2);
  cellEdges(next);
});

test('three images fill the wide area with equal cell spans, widths and gaps', () => {
  for (const [width, left, right, wideStart, wideEnd, count] of [
    [1720, 50, 50, 120, 1600, 24], [2000, 24, 100, 222, 1702, 24],
    [1400, 50, 50, 50, 1350, 24], [900, 24, 60, 24, 840, 24],
    [1200, 50, 50, 50, 1150, 18], [640, 30, 30, 30, 610, 12],
  ]) {
    const g = { ...canvasColumns(width, { left, right, top: 0, bottom: 0 }, wideStart, wideEnd, 19.2, 'desktop', count, {left:wideStart,right:width-wideEnd}), ...canvasRows(0, 0, 12, 19.2), gap: 19.2 };
    const a = g.columns.findIndex(c => Math.abs(c.start - wideStart) < .0001);
    const b = g.columns.findIndex(c => Math.abs(c.end - wideEnd) < .0001) + 1;
    assert.ok(a >= 0 && b > a);
    assert.equal((b - a) % 3, 0);
    const span = (b - a) / 3;
    const blocks = [0, 1, 2].map(i => mapCanvasPlacement({ gridColumns: count, column: a - g.columnOffset + i * span + 1, columnSpan: span, row: 2, rowSpan: 5 }, 'desktop', g));
    near(blocks[0]._rect.left, wideStart);
    near(blocks[2]._rect.left + blocks[2]._rect.width, wideEnd);
    blocks.forEach(p => { near(p._rect.width, blocks[0]._rect.width); cellEdges(p); });
    const gap = Math.min(19.2, (wideEnd - wideStart) / ((b - a) * 2));
    near(blocks[1]._rect.left - blocks[0]._rect.left - blocks[0]._rect.width, gap);
    near(blocks[2]._rect.left - blocks[1]._rect.left - blocks[1]._rect.width, gap);
    assert.ok(g.contentColumns.every(c => c.end - c.start >= 4), 'no unusably thin content cells');
  }
});

test('wide boundaries remain cell edges when the viewport just crosses the theme width', () => {
  for (const width of [1579, 1580, 1581, 1582, 1590, 1600, 1640, 2000, 3000]) {
    const start = Math.max(50, (width - 1480) / 2), end = width - start;
    const g = canvasColumns(width, { left: 50, right: 50 }, start, end, 19.2, 'desktop', 24, {left:start,right:width-end});
    assert.ok(g.columns.every(c => Number.isFinite(c.start) && c.end > c.start));
    assert.ok(g.columns.some(c => Math.abs(c.start - start) < .0001), `${width} missing wide start`);
    assert.ok(g.columns.some(c => Math.abs(c.end - end) < .0001), `${width} missing wide end`);
  }
});
