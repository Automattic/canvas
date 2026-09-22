import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { preserveRowsOnResize, resizeCanvasRows } from '../src/row-resize.mjs';
import { requiredRows, savePlacement } from '../src/geometry.mjs';
import { resolveCanvasLayouts, sourcePlacement } from '../src/canvas-groups.mjs';
import { serializePlacement } from '../src/serialization.mjs';

const geometry = (mode, count, padding) => ({
  ...canvasColumns(1000, padding, 40, 960, 12, mode),
  ...canvasRows(padding.top, padding.bottom, count, 12), gap: 12,
});

test('ordinary row placements and virtual groups require no rewrite', () => {
  const g = geometry('desktop', 12, { top: 0, bottom: 0, left: 0, right: 0 });
  const desktop = mapCanvasPlacement({ row: 2, rowSpan: 3 }, 'desktop', g);
  assert.deepEqual(preserveRowsOnResize({ ordinary: { desktop }, group: { group: true, desktop } }, 'desktop'), {});
});

test('Shift row resizing adds equal space above and below without changing frames', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    for (const padding of [{ top: 0, bottom: 0, left: 0, right: 0 }, { top: 37, bottom: 61, left: 20, right: 20 }]) {
      const before = geometry(mode, 12, padding);
      for (const value of [
        { row: 4, rowSpan: 3 },
        { row: 1, rowSpan: 12, anchors: { right: 'wide' } },
        { row: 9, rowSpan: 6 },
        { free: { x: .1, y: 2.5, width: .2, ratio: 1.5 }, rotation: 20 },
      ]) {
        const original = mapCanvasPlacement({ column: 2, columnSpan: 4, ...value }, mode, before);
        const layouts = { item: { [mode]: original } };
        const snapshot = JSON.stringify(layouts);
        const next = resizeCanvasRows(layouts, mode, 12, requiredRows(layouts, mode), 2, true);
        assert.deepEqual(next, { rows: 16, offset: 2, heightDelta: 4 });
        const shifted = preserveRowsOnResize(layouts, mode, next.offset, next.rows).item;
        const grown = geometry(mode, next.rows, padding);
        for (const placed of [shifted, mapCanvasPlacement(serializePlacement(shifted, mode), mode, grown)]) {
          const expected = { ...original._rect, top: original._rect.top + 72 };
          // Saved free frames use six decimals; live geometry retains full precision.
          const tolerance = placed === shifted ? 1e-7 : .01;
          for (const key of Object.keys(expected)) assert.ok(Math.abs(placed._rect[key] - expected[key]) < tolerance, key);
        }
        assert.equal(JSON.stringify(layouts), snapshot);
      }
    }
  }
});

test('Shift shrinking uses the available space at both ends and keeps row changes paired', () => {
  const g = geometry('desktop', 12, { top: 0, bottom: 0, left: 0, right: 0 });
  for (const row of [1, 3, 7, 10]) {
    const desktop = mapCanvasPlacement({ row, rowSpan: 3 }, 'desktop', g);
    const layouts = { item: { desktop } };
    const room = Math.min(row - 1, 12 - (row + 2));
    const next = resizeCanvasRows(layouts, 'desktop', 12, row + 2, -100, true);
    assert.equal(next.offset, -room || 0);
    assert.equal(next.rows, 12 - room * 2);
    if (room) {
      const shifted = preserveRowsOnResize(layouts, 'desktop', next.offset, next.rows).item;
      assert.equal(shifted._rect.height, desktop._rect.height);
      assert.equal(shifted._rect.top, desktop._rect.top - room * 36);
    }
  }
  assert.deepEqual(resizeCanvasRows({}, 'desktop', 499, 1, 100, true), { rows: 499, offset: 0, heightDelta: 0 });
  assert.deepEqual(resizeCanvasRows({}, 'desktop', 12, 1, -100, true), { rows: 2, offset: -5, heightDelta: -10 });
  assert.deepEqual(resizeCanvasRows({}, 'desktop', 12, 1, 2.25), { rows: 14, offset: 0, heightDelta: 2.25 });
});

test('Shift row resizing moves grouped children once and preserves other authored viewports', () => {
  const padding = { top: 0, bottom: 0, left: 0, right: 0 };
  const geometries = Object.fromEntries(['desktop', 'tablet', 'mobile'].map(mode => [mode, geometry(mode, 20, padding)]));
  const child = { clientId: 'child', name: 'core/paragraph', innerBlocks: [], attributes: { canvas: {
    desktop: { column: 2, columnSpan: 4, row: 4, rowSpan: 3 },
    mobile: { column: 1, columnSpan: 4, row: 2, rowSpan: 2 },
  } } };
  const group = { clientId: 'group', name: 'core/group', attributes: { canvas: { group: 1, offset: { desktop: { x: .025, y: 1.25 } } } }, innerBlocks: [child] };
  const layouts = resolveCanvasLayouts([group], geometries);
  const placements = preserveRowsOnResize(layouts, 'desktop', 2, 24);
  assert.equal(placements.group, undefined);
  const saved = savePlacement(child.attributes.canvas, layouts.child, 'desktop', sourcePlacement(placements.child, 'desktop', layouts.child.desktop));
  assert.deepEqual(saved.mobile, child.attributes.canvas.mobile);
  assert.equal(saved.tablet, undefined);
  const updated = { ...group, innerBlocks: [{ ...child, attributes: { canvas: saved } }] };
  const result = resolveCanvasLayouts([updated], { ...geometries, desktop: geometry('desktop', 24, padding) });
  for (const id of ['child', 'group']) {
    const before = layouts[id].desktop._rect, after = result[id].desktop._rect;
    // Allow only subpixel differences from saving free frames to six decimals.
    assert.ok(Math.abs(after.top - before.top - 72) < .01);
    assert.ok(Math.abs(after.height - before.height) < .01);
    assert.ok(Math.abs(after.width - before.width) < .01);
  }
});
