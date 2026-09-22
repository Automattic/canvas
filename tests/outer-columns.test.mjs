import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, dragMovePlacement, dragResizePlacement, mapCanvasPlacement, nudgeCanvasPlacement, savedCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { droppedLayouts, placementRectangle } from '../src/drop-layout.mjs';
import { minimumSpans } from '../src/placement.mjs';

const padding = { left: 40, right: 40, top: 24, bottom: 24 };
const minimum = minimumSpans('core/paragraph');
const close = (a, b) => assert.ok(Math.abs(a - b) < .0001, `${a} != ${b}`);
const geometry = (width, gap = 12, mode = 'desktop') => {
  const start = Math.max(padding.left, (width - 1340) / 2), end = width - start;
  return { ...canvasColumns(width, padding, start, end, gap, mode, undefined, { left: start, right: start }),
    ...canvasRows(24, 24, 16, 12), gap: 12, mode };
};

test('outer cells continue the content pitch on both sides at every canvas width', () => {
  for (const width of [390, 1340, 1421, 1600, 1920, 2560, 3840, 7680]) for (const gap of [0, 12, 40]) {
    const g = geometry(width, gap), core = g.contentColumns;
    close(core[0].start, g.wideStart);
    close(core.at(-1).end, g.wideEnd);
    assert.equal(core.length, 24);
    assert.ok(g.columns.every(c => c.start >= 0 && c.end <= width + .0001 && c.end > c.start));
    for (const [i, c] of g.columns.entries()) {
      const logical = i - g.columnOffset;
      close(c.start, Math.max(0, g.wideStart + logical * g.columnPitch));
      close(c.end, Math.min(width, g.wideStart + logical * g.columnPitch + core[0].end - core[0].start));
    }
    if (width >= 1600) {
      assert.ok(g.columns.filter(c => c.end < g.wideStart).length >= 2);
      assert.ok(g.columns.filter(c => c.start > g.wideEnd).length >= 2);
    }
  }
});

test('pointer moves, native drops and keyboard nudges reach outer cells and survive serialization', () => {
  for (const width of [1600, 1920, 2560, 3840]) for (const mode of ['desktop', 'tablet', 'mobile']) {
    const g = geometry(width, 12, mode), metrics = { ...g, scale: 1, geometry: { [mode]: g } };
    const start = mapCanvasPlacement({ column: 4, columnSpan: 1, row: 3, rowSpan: 2 }, mode, g);
    for (const cell of g.columns.filter(c => c.end < g.wideStart || c.start > g.wideEnd)) {
      const preview = dragMovePlacement(start, mode, cell.start - start._rect.left, 0, minimum);
      const moved = snapCanvasPlacement(preview, mode, minimum, start, 0);
      close(moved._rect.left, cell.start);
      close(moved._rect.left + moved._rect.width, cell.end);
      const saved = JSON.parse(JSON.stringify(savedCanvasPlacement(moved)));
      assert.deepEqual(mapCanvasPlacement(saved, mode, g)._rect, moved._rect);
      assert.equal(saved.gridColumns, g.gridColumns);
      assert.equal(saved.free, undefined);
      const incoming = { clientId: 'new', name: 'core/paragraph', attributes: { canvas: { desktop: savedCanvasPlacement(start), [mode]: savedCanvasPlacement(start) } } };
      const dropped = droppedLayouts([], [incoming], mode, { x: cell.start, y: start._rect.top }, metrics).new;
      // Native drops retain the standard 6px guide tolerance.
      if (Math.abs(cell.start - padding.left) > 6 && Math.abs(cell.end - (width - padding.right)) > 6) {
        close(placementRectangle(dropped[mode], metrics).left, cell.start);
      }
    }
    const wide = mapCanvasPlacement({ column: 1, columnSpan: 2, row: 3, rowSpan: 2 }, mode, g);
    const nudged = nudgeCanvasPlacement(wide, mode, -1, 0, minimum);
    assert.ok(nudged._rect.left < g.wideStart);
    assert.equal(savedCanvasPlacement(nudged).anchors?.left, nudged._rect.left === 0 ? 'canvas' : -1);
    const back = nudgeCanvasPlacement(nudged, mode, 1, 0, minimum);
    assert.deepEqual(back._rect, wide._rect);
  }
});

test('outer anchors remain relative to wide cells as the viewport gains and loses columns', () => {
  const saved = { column: 1, columnSpan: 2, row: 3, rowSpan: 2, anchors: { left: -3, right: -1 } };
  for (const width of [1920, 2560, 3840]) {
    const g = geometry(width), value = mapCanvasPlacement(saved, 'desktop', g);
    close(value._rect.left, g.wideStart - 3 * g.columnPitch);
    const vertical = snapCanvasPlacement(dragMovePlacement(value, 'desktop', 0, 36, minimum), 'desktop', minimum, value);
    assert.equal(savedCanvasPlacement(vertical).anchors?.left, -3);
    assert.equal(savedCanvasPlacement(vertical).anchors?.right, -1);
    const clipped = mapCanvasPlacement(savedCanvasPlacement(vertical), 'desktop', geometry(900));
    assert.equal(clipped.columnSpan, value.columnSpan, 'a narrower canvas retains the block span');
    assert.deepEqual(mapCanvasPlacement(savedCanvasPlacement(clipped), 'desktop', g)._rect, vertical._rect);
  }
});

test('resizing and moving button-sized blocks can land entirely outside the wide grid', () => {
  const g = geometry(2560), minimum = minimumSpans('core/buttons');
  const start = mapCanvasPlacement({ column: 5, columnSpan: 4, row: 3, rowSpan: 2 }, 'desktop', g, minimum);
  for (const offset of [-6, 26]) {
    const target = g.wideStart + offset * g.columnPitch;
    const moved = snapCanvasPlacement(dragMovePlacement(start, 'desktop', target - start._rect.left, 0, minimum), 'desktop', minimum, start);
    close(moved._rect.left, target);
    assert.equal(moved.columnSpan, 4);
    close(moved._rect.width, start._rect.width);
  }
  const target = g.wideStart - 2 * g.columnPitch;
  const resized = snapCanvasPlacement(dragResizePlacement(start, 'desktop', 'w', target - start._rect.left, 0, minimum), 'desktop', minimum);
  close(resized._rect.left, target);
  close(resized._rect.left + resized._rect.width, start._rect.left + start._rect.width);
});
