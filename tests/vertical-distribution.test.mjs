import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeVertically } from '../src/selection-distribution.mjs';
import { exactPlacement } from '../src/canvas-groups.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { savePlacement } from '../src/geometry.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < .01, `${a} != ${b}`);
for (const mode of ['desktop', 'tablet', 'mobile']) for (const overlap of [false, true]) {
  test(`vertical spacing preserves bounds, proportions, and saved geometry: ${mode}, overlap=${overlap}`, () => {
    const geometry = { ...canvasColumns(1200, { left: 0, right: 0, top: 0, bottom: 0 }, 0, 1200, 10, mode, 24), ...canvasRows(0, 0, 40, 10), gap: 10, viewport: mode, referenceWidth: 1260 };
    const rects = [
      { left: 50, top: 20, width: 200, height: 100 },
      { left: 200, top: overlap ? 50 : 160, width: 180, height: 140 },
      { left: 100, top: overlap ? 90 : 400, width: 150, height: 120 },
    ];
    const blocks = rects.map((rect, i) => ({clientId: String(i), name: 'core/image', attributes: { canvas: {} }}));
    const layouts = Object.fromEntries(blocks.map((b, i) => [b.clientId, { desktop: exactPlacement(rects[i], mode, geometry), [mode]: exactPlacement(rects[i], mode, geometry) }]));
    const result = distributeVertically([...blocks].reverse(), layouts, mode, { cells: false });
    const frames = blocks.map(b => result[b.clientId]._rect);
    close(frames[0].top, 20);
    close(frames[2].top + frames[2].height, rects[2].top + rects[2].height);
    const gaps = frames.slice(1).map((r, i) => r.top - frames[i].top - frames[i].height);
    close(gaps[0], gaps[1]);
    assert.equal(gaps[0] < 0, overlap);
    for (const [i, b] of blocks.entries()) {
      close(frames[i].left, rects[i].left);
      close(frames[i].width / frames[i].height, rects[i].width / rects[i].height);
      close(frames[i].width, rects[i].width);
      close(frames[i].height, rects[i].height);
      const saved = savePlacement({}, layouts[b.clientId], mode, result[b.clientId]);
      const restored = mapCanvasPlacement(saved[mode], mode, geometry);
      for (const key of ['left', 'top', 'width', 'height']) close(restored._rect[key], frames[i][key]);
    }
    const again = distributeVertically(blocks, Object.fromEntries(blocks.map(b => [b.clientId, { [mode]: result[b.clientId] }])), mode, { cells: false });
    for (const b of blocks) for (const key of ['left', 'top', 'width', 'height']) close(again[b.clientId]._rect[key], result[b.clientId]._rect[key]);
    assert.equal(distributeVertically([blocks[0]], layouts, mode, { cells: false }), null);
    assert.equal(distributeVertically(blocks, {}, mode), null);
  });
}
