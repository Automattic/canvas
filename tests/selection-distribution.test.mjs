import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeHorizontally } from '../src/selection-distribution.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { savePlacement } from '../src/geometry.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < .01, `${a} != ${b}`);
for (const mode of ['desktop', 'tablet', 'mobile']) for (const overlap of [false, true]) {
  test(`distribution retains outer bounds and sizes with equal gaps in ${mode} (${overlap ? 'overlapping' : 'separated'})`, () => {
    const geometry = { ...canvasColumns(1800, { left: 300, right: 300, top: 0, bottom: 0 }, 300, 1500, 10, mode, 24),
      ...canvasRows(0, 0, 24, 10), gap: 10, viewport: mode, referenceWidth: 1260 };
    const sources = [
      { free: { x: 0, y: 3, width: overlap ? .6 : .2, ratio: 1.2 }, anchors: { left: 'canvas' } },
      { free: { x: .12, y: 5, width: overlap ? .65 : .15, ratio: 1.5 }, anchors: { left: 'wide' } },
      { free: { x: .5, y: 2, width: overlap ? .7 : .25, ratio: 1.1 }, anchors: { right: 'canvas' } },
    ];
    const blocks = sources.map((desktop, i) => ({ clientId: String(i), name: 'core/image', attributes: { canvas: { desktop } } }));
    const layouts = Object.fromEntries(blocks.map((block, i) => {
      const placement = mapCanvasPlacement({ column: 1, row: 1, columnSpan: 4, rowSpan: 5, gridColumns: 24, ...sources[i] }, mode, geometry);
      return [block.clientId, { desktop: placement, [mode]: placement, image: true }];
    }));
    const result = distributeHorizontally(blocks, layouts, mode, { cells: false });
    const ordered = Object.values(result).sort((a, b) => a._rect.left - b._rect.left);
    close(ordered[0]._rect.left, 0);
    close(ordered.at(-1)._rect.left + ordered.at(-1)._rect.width, 1800);
    const gaps = ordered.slice(1).map((p, i) => p._rect.left - ordered[i]._rect.left - ordered[i]._rect.width);
    close(gaps[0], gaps[1]);
    assert.equal(gaps[0] < 0, overlap);
    for (const block of blocks) {
      const next = result[block.clientId];
      const original = layouts[block.clientId][mode]._rect;
      close(next._rect.top, original.top);
      close(next._rect.width / next._rect.height, original.width / original.height);
      close(next._rect.width, original.width); close(next._rect.height, original.height);
      const saved = savePlacement(block.attributes.canvas, layouts[block.clientId], mode, next);
      const restored = mapCanvasPlacement(saved[mode], mode, geometry);
      for (const key of ['left', 'top', 'width', 'height']) close(restored._rect[key], next._rect[key]);
    }
    const again = distributeHorizontally(blocks, Object.fromEntries(blocks.map(b => [b.clientId, { [mode]: result[b.clientId] }])), mode, { cells: false });
    for (const block of blocks) for (const key of ['left', 'top', 'width', 'height']) close(again[block.clientId]._rect[key], result[block.clientId]._rect[key]);
    assert.equal(distributeHorizontally([blocks[0]], layouts, mode, { cells: false }), null);
  });
}
