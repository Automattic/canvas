import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, occupiedRows, resizeCanvasWithKey, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { minimumSpans, normalizePlacement } from '../src/geometry.mjs';

const minimum = minimumSpans('core/paragraph');
function placement(mode = 'desktop', rotation = 0, rows = 12) {
  const width = mode === 'mobile' ? 390 : 1200;
  const padding = { top: 37, right: 29, bottom: 41, left: 29 };
  const g = { ...canvasColumns(width, padding, 29, width - 29, 12, mode), ...canvasRows(37, 41, rows, 12), gap: 12 };
  return mapCanvasPlacement(normalizePlacement({ column: 2, columnSpan: 3, row: 2, rowSpan: 3, rotation, gridColumns: mode === 'mobile' ? 8 : 24 }, mode), mode, g, minimum);
}

test('keyboard resizing changes one dimension and preserves origin and rotation', () => {
  for (const mode of ['desktop', 'mobile']) {
    const start = placement(mode, 37);
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = resizeCanvasWithKey(start, mode, x, y, minimum);
      assert.equal(next.columnSpan, start.columnSpan + x);
      assert.equal(next.rowSpan, start.rowSpan + y);
      assert.equal(next._rect.left, start._rect.left);
      assert.equal(next._rect.top, start._rect.top);
      assert.equal(next.rotation, 37);
      assert.ok(!savedCanvasPlacement(next).free);
    }
  }
});

test('keyboard resize clamps minimums and canvas bounds', () => {
  let value = placement();
  for (let i = 0; i < 30; i++) value = resizeCanvasWithKey(value, 'desktop', -1, 0, minimum);
  assert.equal(value.columnSpan, minimum.columnSpan);
  for (let i = 0; i < 30; i++) value = resizeCanvasWithKey(value, 'desktop', 0, -1, minimum);
  assert.equal(value.rowSpan, minimum.rowSpan);
  for (let i = 0; i < 40; i++) value = resizeCanvasWithKey(value, 'desktop', 1, 0, minimum);
  assert.ok(value._rect.left + value._rect.width <= value._canvas.width + .001);
});

test('ratio-locked resizing couples dimensions, keeps origin, rotation and grid anchors', () => {
  const start = placement('desktop', 23);
  const ratio = start._rect.width / start._rect.height;
  const next = resizeCanvasWithKey(start, 'desktop', 1, 0, minimum, ratio);
  assert.ok(next._rect.width > start._rect.width);
  assert.ok(next._rect.height >= start._rect.height);
  assert.equal(next._rect.left, start._rect.left);
  assert.equal(next._rect.top, start._rect.top);
  assert.equal(next.rotation, 23);
  assert.equal(savedCanvasPlacement(next).rotation, 23);
  assert.ok(!savedCanvasPlacement(next).free);
});

test('keyboard height grows rows and stops at the 500-row ceiling', () => {
  let value = placement('desktop', 0, 4);
  for (let i = 0; i < 510; i++) value = resizeCanvasWithKey(value, 'desktop', 0, 1, minimum);
  assert.equal(occupiedRows(value), 500);
  assert.ok(value.rowSpan > 400);
  const before = savedCanvasPlacement(value);
  assert.deepEqual(savedCanvasPlacement(resizeCanvasWithKey(value, 'desktop', 0, 1, minimum)), before);
});
