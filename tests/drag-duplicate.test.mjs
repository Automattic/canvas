import test from 'node:test';
import assert from 'node:assert/strict';
import { canDuplicateSelection, duplicateDragLayout } from '../src/drag-duplicate.mjs';
import { COLUMNS } from '../src/placement.mjs';
import { canvasColumns, canvasRows } from '../src/canvas-geometry.mjs';
import { resolveCanvasLayouts, translateGroupPlacement } from '../src/canvas-groups.mjs';
const padding = { top: 24, right: 24, bottom: 24, left: 24 };
const geometry = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, {
  ...canvasColumns(1200, padding, 100, 1100, 12, mode), ...canvasRows(24, 24, 24, 12), gap: 12,
}]));
const leaf = (id, column) => ({ clientId: id, name: 'core/paragraph', attributes: {
  content: id, canvas: { desktop: { gridColumns: 24, column, columnSpan: 4, row: 3, rowSpan: 3, rotation: 13 }, mobile: { column: 2, row: 5, columnSpan: 5, rowSpan: 4 } },
}, innerBlocks: [] });
for (const mode of Object.keys(COLUMNS)) {
  for (const grouped of [false, true]) {
    test(`${mode}: drag copies preserve originals, responsive settings and nested geometry (group=${grouped})`, () => {
      const block = grouped ? { clientId: 'group', name: 'core/group', attributes: { canvas: { group: 1 } }, innerBlocks: [leaf('a', 2), leaf('b', 9)] } : leaf('a', 2);
      const before = structuredClone(block);
      const layouts = resolveCanvasLayouts([block], geometry);
      const current = layouts[block.clientId];
      const destination = translateGroupPlacement(current[mode], mode, 55, 77);
      const saved = duplicateDragLayout(block, current, destination, mode);
      const copy = { ...block, clientId: 'copy', attributes: { ...block.attributes, canvas: saved } };
      const after = resolveCanvasLayouts([copy], geometry).copy[mode];
      for (const key of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(after._rect[key] - destination._rect[key]) < .01, key);
      assert.deepEqual(block, before);
      assert.ok(!JSON.stringify(saved).includes('_rect'));
      if (!grouped && mode !== 'mobile') assert.deepEqual(saved.mobile, before.attributes.canvas.mobile);
      if (!grouped && mode !== 'desktop') assert.deepEqual(saved.desktop, before.attributes.canvas.desktop);
    });
  }
}
test('duplication respects parent insertion permissions, template locks and editing mode', () => {
  const store = { getBlockRootClientId: () => 'parent', getTemplateLock: () => false, getBlockEditingMode: () => 'default', canInsertBlockType: () => true, getBlockName: () => 'core/paragraph' };
  assert.equal(canDuplicateSelection(store, ['a', 'b']), true);
  assert.equal(canDuplicateSelection(store, []), false);
  for (const [key, value] of [['getTemplateLock', 'insert'], ['getBlockEditingMode', 'contentOnly'], ['canInsertBlockType', false]]) assert.equal(canDuplicateSelection({ ...store, [key]: () => value }, ['a']), false);
  assert.equal(canDuplicateSelection({ ...store, getBlockRootClientId: id => id }, ['a', 'b']), false);
});
