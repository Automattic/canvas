import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, dragCanvasPlacement, dragMovePlacement, dragResizePlacement, settleCanvasPlacement } from '../src/canvas-geometry.mjs';
import { serializePlacement } from '../src/serialization.mjs';
import { droppedLayouts, placementRectangle } from '../src/drop-layout.mjs';
import { insertionLayout } from '../src/insertion-layout.mjs';
import { moveSelection } from '../src/selection-movement.mjs';

const minimum = { columnSpan: 1, rowSpan: 1 };
const close = (a, b) => assert.ok(Math.abs(a - b) < .01, `${a} != ${b}`);
const same = (a, b) => ['left', 'top', 'width', 'height'].forEach(key => close(a[key], b[key]));
const geometry = (mode) => ({ ...canvasColumns(1000, { top: 20, bottom: 20, left: 20, right: 20 }, 20, 980, 12, mode), ...canvasRows(20, 20, 20, 12, 24), gap: 12 });

for (const mode of ['desktop', 'tablet', 'mobile']) {
  test(`${mode}: freeform movement and resizing retain exact coordinates through serialization`, () => {
    const g = geometry(mode);
    const start = mapCanvasPlacement({ column: 2, columnSpan: 3, row: 3, rowSpan: 3 }, mode, g, minimum);
    const before = serializePlacement(start);
    const moved = dragCanvasPlacement(start, mode, 'move', 7.3, 11.7, minimum, 6, false);
    close(moved._rect.left, start._rect.left + 7.3);
    close(moved._rect.top, start._rect.top + 11.7);
    close(moved._rect.width, start._rect.width);
    const resized = dragCanvasPlacement(moved, mode, 'se', 13.2, 8.4, minimum, 6, false);
    close(resized._rect.width, moved._rect.width + 13.2);
    close(resized._rect.height, moved._rect.height + 8.4);
    same(mapCanvasPlacement(serializePlacement(resized), mode, g, minimum)._rect, resized._rect);
    assert.deepEqual(serializePlacement(start), before);
  });

  test(`${mode}: returning to cells preserves size on movement and untouched edges on resize`, () => {
    const g = geometry(mode);
    const start = mapCanvasPlacement({ free: { x: .173, y: 2.31, width: .253, ratio: 1.83 } }, mode, g, minimum);
    const moved = dragCanvasPlacement(start, mode, 'move', 39, 41, minimum);
    close(moved._rect.width, start._rect.width);
    close(moved._rect.height, start._rect.height);
    assert.ok(g.columns.some(track => Math.abs(track.start - moved._rect.left) < .01));
    assert.ok(g.rows.some(track => Math.abs(track.start - moved._rect.top) < .01));
    for (const kind of ['e', 'w', 'n', 's']) {
      const preview = dragResizePlacement(start, mode, kind, kind === 'w' ? -43 : 43, kind === 'n' ? -39 : 39, minimum);
      const next = settleCanvasPlacement(preview, mode, minimum, undefined, 6, undefined, true, start, kind);
      if (kind === 'e' || kind === 'w') {
        close(next._rect.top, start._rect.top);
        close(next._rect.height, start._rect.height);
      } else {
        close(next._rect.left, start._rect.left);
        close(next._rect.width, start._rect.width);
      }
      same(mapCanvasPlacement(serializePlacement(next), mode, g, minimum)._rect, next._rect);
    }
  });
}

test('freeform moves near the bottom do not magnetize to the section edge', () => {
  const g = geometry('desktop');
  const start = mapCanvasPlacement({ free: { x: .1, y: 14, width: .2, ratio: 1 } }, 'desktop', g, minimum);
  const dy = g.height - start._rect.top - start._rect.height - 3;
  const next = dragMovePlacement(start, 'desktop', 0, dy, minimum, 1, false);
  close(next._rect.top + next._rect.height, g.height - 3);
});

test('freeform drops and contextual insertion use the requested point', () => {
  const g = geometry('desktop'), metrics = { ...g, mode: 'desktop', geometry: { desktop: g } };
  const block = { clientId: 'new', name: 'core/image', attributes: {}, innerBlocks: [] };
  const point = { x: 133.3, y: 111.7 };
  for (const layout of [droppedLayouts([], [block], 'desktop', point, metrics, false).new, insertionLayout([], block, 'desktop', metrics, point, false)]) {
    const rect = placementRectangle(layout.desktop, metrics);
    close(rect.left, point.x);
    close(rect.top, point.y);
    assert.ok(layout.desktop.free);
    assert.equal(layout.tablet, undefined);
  }
});

test('freeform multi-selection applies a shared exact delta', () => {
  const g = geometry('desktop');
  const a = mapCanvasPlacement({ column: 2, columnSpan: 3, row: 2, rowSpan: 3 }, 'desktop', g, minimum);
  const b = mapCanvasPlacement({ column: 8, columnSpan: 4, row: 6, rowSpan: 3 }, 'desktop', g, minimum);
  const next = moveSelection({ a: { desktop: a }, b: { desktop: b } }, ['a', 'b'], 'desktop', 'a', 1, 10, { snap: false });
  for (const [id, start] of Object.entries({ a, b })) {
    close(next[id]._rect.left, start._rect.left + 1);
    close(next[id]._rect.top, start._rect.top + 10);
  }
});
