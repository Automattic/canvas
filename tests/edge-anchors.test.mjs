import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, dragMovePlacement, dragResizePlacement, mapCanvasPlacement, mapCanvasRowsPlacement, savedCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveLayouts, savePlacement, rowHeightForWidth } from '../src/geometry.mjs';
import { preserveRowsOnResize } from '../src/row-resize.mjs';

const minimum = { columnSpan: 1, rowSpan: 1 };
const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const geometry = (width = 1440, mode = 'desktop', count = 12, pad = 0) => {
  const padding = { top: pad, bottom: pad, left: 50, right: 50 };
  const inset = Math.max(50, (width - 1480) / 2);
  return { ...canvasColumns(width, padding, inset, width - inset, 24, mode, undefined,
    { ...padding, left: inset, right: inset }),
  ...canvasRows(pad, pad, count, 24, rowHeightForWidth(width - inset * 2, mode)),
  gap: 24, viewport: mode, referenceWidth: 1580, referenceColumns: 24 };
};
const image = desktop => ({ clientId: 'image', name: 'core/image', attributes: { canvas: { desktop } } });

test('resizing slightly past the section bottom snaps to its existing edge without adding a row', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const pad of [0, 12, 37]) {
    const g = geometry(1440, mode, 12, pad);
    const start = mapCanvasRowsPlacement({ column: 5, columnSpan: 6, row: 1, rowSpan: 8, anchors: { right: 'canvas' } }, mode, g, minimum, { top:0 });
    for (const overshoot of [-5, 0, 5]) {
      const preview = dragResizePlacement(start, mode, 's', 0, g.height - start._rect.top - start._rect.height + overshoot, minimum);
      const drop = snapCanvasPlacement(preview, mode, minimum);
      close(drop._rect.top, 0);
      close(drop._rect.top + drop._rect.height, g.height);
      assert.equal(drop._canvas.coreRows, 12);
      assert.equal(drop._base.anchors.bottom, undefined);
      assert.equal(drop._base.anchors.top, undefined);
    }
  }
});

test('dragging slightly past the bottom captures the edge and preserves the moved span', () => {
  const g = geometry();
  const start = mapCanvasPlacement({ column: 3, columnSpan: 6, row: 3, rowSpan: 4 }, 'desktop', g);
  const preview = dragMovePlacement(start, 'desktop', g.width - start._rect.left - start._rect.width,
    g.height - start._rect.top - start._rect.height + 4, minimum);
  const drop = snapCanvasPlacement(preview, 'desktop', minimum, start);
  close(drop._rect.left + drop._rect.width, g.width);
  close(drop._rect.top + drop._rect.height, g.height);
  close(drop._rect.height, start._rect.height);
  assert.equal(drop._base.anchors.right, 'canvas');
  assert.equal(drop._base.anchors.bottom, undefined);
});

test('a precise centered image catches the original bottom before preview rows grow', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const pad of [0, 12, 37]) {
    const g = geometry(900, mode, 12, pad);
    const start = mapCanvasPlacement({ column: 8, columnSpan: 10, row: 4, rowSpan: 6,
      free: { x: .3, y: 3, width: .4, ratio: 1.4172,  } }, mode, g);
    for (const overshoot of [-20, -5, 0, 5, 20]) {
      const dy = g.height - start._rect.top - start._rect.height + overshoot;
      const preview = dragMovePlacement(start, mode, 0, dy, minimum);
      close(preview._rect.top + preview._rect.height, g.height);
      assert.equal(preview._canvas.coreRows, g.coreRows);
      const drop = snapCanvasPlacement(preview, mode, minimum, start);
      close(drop._rect.top + drop._rect.height, g.height);
      assert.ok(g.rows.some(row=>Math.abs(row.start-drop._rect.top)<.001));
      assert.ok(g.columns.some(col=>Math.abs(col.start-drop._rect.left)<.001));
      assert.equal(drop._canvas.coreRows, g.coreRows);
      assert.equal(savedCanvasPlacement(drop).free?.anchorY, undefined);
      const reopened = mapCanvasPlacement(savedCanvasPlacement(drop), mode, g);
      close(reopened._rect.top + reopened._rect.height, g.height);
    }
    const beyond = dragMovePlacement(start, mode, 0, g.height - start._rect.top - start._rect.height + 80, minimum);
    assert.ok(beyond._canvas.coreRows > g.coreRows, 'A deliberate drag beyond the edge can still grow the canvas');
  }
});

test('bottom-left image holds the boundary before deliberate row growth, including editor zoom', () => {
  for (const scale of [1, 2]) {
    const g = geometry();
    const start = mapCanvasPlacement({ column: 1, row: 5, columnSpan: 8, rowSpan: 8,
      gridColumns: 24, frameRatio: 1.00105, anchors: { left: 'canvas', right: 7 } }, 'desktop', g);
    const distance = g.height - start._rect.top - start._rect.height;
    const threshold = Math.max(24 * scale, (g.rowHeight + g.gap) * .75);
    const preview = dragMovePlacement(start, 'desktop', 0, distance + threshold - 1, minimum, scale);
    assert.equal(preview._canvas.coreRows, g.coreRows);
    close(preview._rect.top + preview._rect.height, g.height);
    const drop = snapCanvasPlacement(preview, 'desktop', minimum, start);
    assert.equal(savedCanvasPlacement(drop).anchors.left, 'canvas');
    assert.equal(savedCanvasPlacement(drop).anchors.bottom, undefined);
    const reopened = mapCanvasPlacement(savedCanvasPlacement(drop), 'desktop', g);
    close(reopened._rect.top + reopened._rect.height, g.height);
    const beyond = dragMovePlacement(start, 'desktop', 0, distance + threshold + 1, minimum, scale);
    assert.ok(beyond._canvas.coreRows > g.coreRows);
  }
});

test('ordinary section resizing retains placement while Shift resizing adds space around content', () => {
  const g = geometry();
  const source = { column: 13, columnSpan: 12, row: 1, rowSpan: 12, gridColumns: 24,
    anchors: { left: 'center', right: 'canvas' }, frameRatio: 1.32231 };
  const layouts = resolveLayouts([image(source)], { desktop: g });
  assert.deepEqual(preserveRowsOnResize(layouts, 'desktop', 0, 18), {});
  const grown = resolveLayouts([image(source)], { desktop: geometry(1440, 'desktop', 18) }).image.desktop;
  close(grown._rect.height, layouts.image.desktop._rect.height);
  const shifted = preserveRowsOnResize(layouts, 'desktop', 2, 16).image;
  close(shifted._rect.height, layouts.image.desktop._rect.height);
  close(shifted._rect.top, 2 * (g.rowHeight + g.gap));
});
