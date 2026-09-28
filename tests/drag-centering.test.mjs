import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, dragCanvasPlacement, dragMovePlacement, mapCanvasPlacement, settleCanvasPlacement } from '../src/canvas-geometry.mjs';
import { freeFrameFromRect } from '../src/aspect-ratio.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { serializePlacement } from '../src/serialization.mjs';
import { COLUMNS, minimumSpans } from '../src/placement.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < .002, `${a} != ${b}`);
const same = (a, b) => ['left', 'top', 'width', 'height'].forEach(key => close(a[key], b[key]));
function geometry(mode, gap) {
  return { ...canvasColumns(1200, {left: 24, right: 24, top: 24, bottom: 24}, 24, 1176, gap, mode),
    ...canvasRows(24, 24, 16, gap), gap };
}
function placement(mode, g, precise, span = 5) {
  const start = mapCanvasPlacement({column: 2, columnSpan: span, row: 3, rowSpan: 4, gridColumns: COLUMNS[mode]}, mode, g);
  return precise ? mapCanvasPlacement({...start._base, free: freeFrameFromRect(start._rect, g)}, mode, g) : start;
}

test('dragging odd-width grid and precise frames to center uses a symmetric span in preview, release, and saved media', () => {
  for (const mode of Object.keys(COLUMNS)) for (const gap of [0, 12]) for (const precise of [false, true]) {
    for (const span of [4, 5, 6]) for (const name of ['core/paragraph', 'core/image', 'core/video']) {
      const g = geometry(mode, gap), initial = placement(mode, g, precise, span), minimum = minimumSpans(name);
      const block = {clientId: 'item', name, attributes: {canvas: {desktop: initial._base, [mode]: initial._base}}, innerBlocks: []};
      const all = {desktop: geometry('desktop', gap), [mode]: g};
      const layout = resolveLayouts([block], all).item, start = layout[mode];
      const dx = g.center - start._rect.width / 2 - start._rect.left;
      for (const offset of [-5, 0, 5]) {
        const preview = dragMovePlacement(start, mode, dx + offset, 0, minimum);
        const drop = settleCanvasPlacement(preview, mode, minimum, start);
        close(drop._rect.left + drop._rect.width / 2, g.center);
        const expectedWidth = g.columnPitch * (span + span % 2) - g.columnGap;
        close(drop._rect.width, expectedWidth);
        close(drop._rect.top, start._rect.top);
        close(drop._rect.height, start._rect.height);
        same(dragCanvasPlacement(start, mode, 'move', dx + offset, 0, minimum)._rect, drop._rect);
        const saved = savePlacement(block.attributes.canvas, layout, mode, drop, minimum);
        const reopened = resolveLayouts([{...block, attributes: {canvas: saved}}], all).item[mode];
        same(reopened._rect, drop._rect);
        if (mode !== 'desktop') assert.deepEqual(saved.desktop, serializePlacement(block.attributes.canvas.desktop));
      }
    }
  }
});

test('precise frames keep dimensions away from center and when only the other axis moves', () => {
  for (const mode of Object.keys(COLUMNS)) {
    const g = geometry(mode, 12), start = placement(mode, g, true);
    const dx = g.center - start._rect.width / 2 - start._rect.left;
    for (const delta of [17, dx - 7, dx + 7]) {
      const moved = dragCanvasPlacement(start, mode, 'move', delta, 0);
      close(moved._rect.width, start._rect.width);
      close(moved._rect.height, start._rect.height);
    }
    const centered = dragMovePlacement(start, mode, dx, 0);
    const vertical = dragCanvasPlacement(centered, mode, 'move', 0, g.rowHeight + g.gap);
    close(vertical._rect.width, start._rect.width);
    const freeform = dragCanvasPlacement(start, mode, 'move', dx + 2, 0, undefined, 6, false);
    close(freeform._rect.width, start._rect.width);
    close(freeform._rect.left, start._rect.left + dx + 2);
  }
});

test('a precise frame can also catch the vertical center with a symmetric row span', () => {
  const mode = 'desktop', g = geometry(mode, 12);
  const grid = mapCanvasPlacement({column: 2, columnSpan: 5, row: 2, rowSpan: 5}, mode, g);
  const start = mapCanvasPlacement({...grid._base, free: freeFrameFromRect(grid._rect, g)}, mode, g);
  const dy = g.height / 2 - start._rect.top - start._rect.height / 2;
  const drop = dragCanvasPlacement(start, mode, 'move', 0, dy);
  close(drop._rect.top + drop._rect.height / 2, g.height / 2);
  close(drop._rect.left, start._rect.left);
  close(drop._rect.width, start._rect.width);
});
