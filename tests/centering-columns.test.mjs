import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, columnsForAlignment, minimumSpans } from '../src/placement.mjs';
import { canvasColumns, canvasRows } from '../src/canvas-geometry.mjs';
import { resolveCanvasLayouts } from '../src/canvas-groups.mjs';
import { savePlacement } from '../src/geometry.mjs';
import { centerSelection } from '../src/selection-movement.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const frame = (a, b) => ['left', 'top', 'width', 'height'].forEach(key => close(a._rect[key], b._rect[key]));

test('horizontal centering adjusts odd widths within fixed columns and survives saving', () => {
  for (const mode of Object.keys(COLUMNS)) for (const align of ['full', 'wide', undefined]) {
    for (const gap of [0, 12]) for (const span of [4, 5, 6]) for (const name of ['core/paragraph', 'core/image', 'core/buttons']) {
      const count = columnsForAlignment(mode, align), padding = { top: 24, bottom: 24, left: 24, right: 24 };
      const g = { ...canvasColumns(1200, padding, 24, 1176, gap, mode, count), ...canvasRows(24, 24, 12, gap), gap };
      const geometry = { [mode]: g }, minimum = minimumSpans(name);
      const placement = { column: 2, columnSpan: span, row: 3, rowSpan: 5, gridColumns: count };
      const item = { clientId: 'item', name, attributes: { canvas: { desktop: placement, [mode]: placement } }, innerBlocks: [] };
      const layouts = resolveCanvasLayouts([item], geometry), start = layouts.item[mode];
      // Image centering must update its saved proportions to the new width.
      if (name === 'core/image') {
        const ratio = Number((start._rect.width / start._rect.height).toPrecision(6));
        start.frameRatio = ratio;
        start._base.frameRatio = ratio;
        item.attributes.canvas[mode].frameRatio = ratio;
      }
      const result = centerSelection(layouts, ['item'], mode, 'horizontal', { minimums: { item: minimum } });
      const p = result.placements.item, expectedSpan = span + span % 2;
      assert.equal(p._base.columnSpan, expectedSpan);
      assert.equal(p._base.column - 1, count - p._base.column - expectedSpan + 1);
      assert.equal(p._canvas.gridColumns, count);
      assert.equal(result.rows, 12);
      close(p._rect.left + p._rect.width / 2, g.center);
      close(p._rect.top, start._rect.top);
      close(p._rect.height, start._rect.height);
      const saved = savePlacement(item.attributes.canvas, layouts.item, mode, p, minimum);
      if (mode !== 'desktop') assert.deepEqual(saved.desktop, item.attributes.canvas.desktop);
      const reopened = resolveCanvasLayouts([{ ...item, attributes: { canvas: saved } }], geometry);
      frame(reopened.item[mode], p);
      const again = centerSelection(reopened, ['item'], mode, 'horizontal', { minimums: { item: minimum } });
      frame(again.placements.item, p);
      assert.equal(again.rows, 12);
      const freeform = centerSelection(layouts, ['item'], mode, 'horizontal', { cells: false });
      close(freeform.placements.item._rect.width, start._rect.width);
      close(freeform.placements.item._rect.left + start._rect.width / 2, g.center);
    }
  }
});

test('centering both axes widens an odd column span and adds a row in one result', () => {
  const padding = { top: 0, bottom: 0, left: 0, right: 0 };
  const g = { ...canvasColumns(1200, padding, 0, 1200, 0, 'desktop'), ...canvasRows(0, 0, 12, 0), gap: 0 };
  const item = { clientId: 'item', name: 'core/paragraph', attributes: { canvas: { desktop: {
    column: 2, columnSpan: 5, row: 2, rowSpan: 5, gridColumns: 24,
  } } }, innerBlocks: [] };
  const layouts = resolveCanvasLayouts([item], { desktop: g });
  const result = centerSelection(layouts, ['item'], 'desktop', 'both'), p = result.placements.item;
  assert.equal(p._base.columnSpan, 6);
  assert.equal(p._base.column, 10);
  assert.equal(p._base.rowSpan, 5);
  assert.equal(p._base.row, 5);
  assert.equal(result.rows, 13);
  assert.equal(p._canvas.gridColumns, 24);
  close(p._rect.left + p._rect.width / 2, 600);
  close(p._rect.top + p._rect.height / 2, p._canvas.height / 2);
});
