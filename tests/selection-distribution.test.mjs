import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeHorizontally } from '../src/selection-distribution.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { savePlacement } from '../src/geometry.mjs';

for (const mode of ['desktop', 'tablet', 'mobile']) {
  test(`distribution preserves vertical geometry and round trips in ${mode}`, () => {
    const geometry = { ...canvasColumns(1200, { left: 30, right: 30, top: 0, bottom: 0 }, 30, 1170, 10, mode, 12), ...canvasRows(0, 0, 20, 10), gap: 10 };
    const blocks = Array.from({ length: 5 }, (_, i) => ({ clientId: String(i), name: 'core/image', attributes: {} }));
    const layouts = Object.fromEntries(blocks.map((block, i) => {
      const placement = mapCanvasPlacement({ column: 10 - i, columnSpan: 2, row: i + 1, rowSpan: 3, gridColumns: 12 }, mode, geometry);
      return [block.clientId, { desktop: placement, [mode]: placement, image: true }];
    }));
    const result = distributeHorizontally(blocks, layouts, mode);
    const ordered = Object.values(result).sort((a, b) => a._rect.left - b._rect.left);
    assert.deepEqual(ordered.map(p => geometry.contentColumns.filter(t => t.start >= p._rect.left - 0.001 && t.end <= p._rect.left + p._rect.width + 0.001).length), [2, 3, 2, 3, 2]);
    for (const block of blocks) {
      const next = result[block.clientId];
      assert.equal(next._rect.top, layouts[block.clientId][mode]._rect.top);
      assert.equal(next._rect.height, layouts[block.clientId][mode]._rect.height);
      const saved = savePlacement({}, layouts[block.clientId], mode, next);
      const restored = mapCanvasPlacement(saved[mode], mode, geometry);
      for (const key of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(restored._rect[key] - next._rect[key]) < 0.01, key);
    }
    assert.equal(distributeHorizontally(blocks.map(b => ({ ...b, name: 'core/buttons' })), layouts, mode), null);
    assert.equal(distributeHorizontally([blocks[0]], layouts, mode), null);
  });
}
