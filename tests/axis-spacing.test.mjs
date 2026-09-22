import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, dragMovePlacement, snapCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { nudgeGroupPlacement } from '../src/canvas-groups.mjs';
import { withInsertionDefaults } from '../src/insertion-defaults.mjs';

const padding = { left: 24, right: 24, top: 24, bottom: 24 };
const geometry = (x, y, mode = 'desktop', width = 1200) => ({
  ...canvasColumns(width, padding, 24, width - 24, x, mode),
  ...canvasRows(24, 24, 20, y, 24), gap: y,
});
const value = { column: 4, columnSpan: 6, row: 3, rowSpan: 4 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('horizontal and vertical spacing change only their own grid axis', () => {
  const a = geometry(12, 16), x = geometry(20, 16), y = geometry(12, 40);
  assert.deepEqual(a.rows, x.rows);
  assert.deepEqual(a.columns, y.columns);
  assert.notDeepEqual(a.columns, x.columns);
  assert.notDeepEqual(a.rows, y.rows);
  for (const g of [a, x, y]) {
    const start = mapCanvasPlacement(value, 'desktop', g);
    const moved = snapCanvasPlacement(dragMovePlacement(start, 'desktop', 37, 61, { columnSpan: 1, rowSpan: 1 }), 'desktop', undefined, start);
    assert.ok(g.columns.some(c => Math.abs(c.start - moved._rect.left) < 1e-7));
    assert.ok(g.rows.some(r => Math.abs(r.start - moved._rect.top) < 1e-7));
    assert.deepEqual(mapCanvasPlacement(JSON.parse(JSON.stringify(savedCanvasPlacement(moved))), 'desktop', moved._canvas)._rect, moved._rect);
  }
});

test('group keyboard movement uses the actual column pitch and independent row pitch', () => {
  for (const [x, y] of [[0, 40], [20, 4], [80, 0]]) {
    const g = geometry(x, y), start = mapCanvasPlacement(value, 'desktop', g);
    const next = nudgeGroupPlacement(start, 'desktop', 1, 1);
    close(next._rect.left - start._rect.left, g.contentColumns[1].start - g.contentColumns[0].start);
    close(next._rect.top - start._rect.top, 24 + y);
    close(next._rect.width, start._rect.width);
    close(next._rect.height, start._rect.height);
  }
});

test('mobile insertion sizes desktop images from horizontal spacing and vertical rows', () => {
  const desktop = { ...geometry(10, 40, 'desktop', 390), referenceWidth: 1200, referenceRowHeight: 24 };
  const mobile = geometry(10, 40, 'mobile', 390);
  const image = withInsertionDefaults({ name: 'core/image', attributes: {} }, 'mobile', { ...mobile, geometry: { desktop, mobile } });
  const reference = geometry(10, 40);
  const saved = image.attributes.canvas.desktop;
  const width = reference.contentColumns[saved.columnSpan - 1].end - reference.contentColumns[0].start;
  assert.equal(saved.rowSpan, Math.round((width + 40) / 64));
});
