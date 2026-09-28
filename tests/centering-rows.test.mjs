import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, MAX_ROWS } from '../src/placement.mjs';
import { canvasColumns, canvasRows } from '../src/canvas-geometry.mjs';
import { resolveCanvasLayouts, saveGroupMove, sourcePlacement } from '../src/canvas-groups.mjs';
import { savePlacement } from '../src/geometry.mjs';
import { centerSelection } from '../src/selection-movement.mjs';
import { sectionRows } from '../src/section-layout.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const geometry = (rows, gap = 0, top = 24, bottom = top) => Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, {
  ...canvasColumns(1200, { top, bottom, left: 24, right: 24 }, 24, 1176, gap, mode),
  ...canvasRows(top, bottom, rows, gap), gap,
}]));
const block = (id, span, row = 1) => ({ clientId: id, name: 'core/paragraph', attributes: {
  canvas: Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, { column: 3, columnSpan: 4, row, rowSpan: span, gridColumns: COLUMNS[mode], rotation: 13 }])),
}, innerBlocks: [] });
const sameFrame = (a, b) => ['left', 'top', 'width', 'height'].forEach(key => close(a._rect[key], b._rect[key]));

test('centering adds one row only when fixed spans need it in every viewport', () => {
  for (const mode of Object.keys(COLUMNS)) for (const axis of ['vertical', 'both']) for (const gap of [0, 12, 24]) {
    for (const [rows, span] of [[12, 5], [11, 4], [12, 6], [1, 1], [2, 1]]) {
      const item = block('item', span), sibling = block('sibling', 1, rows);
      const g = geometry(rows, gap), layouts = resolveCanvasLayouts([item, sibling], g);
      const result = centerSelection(layouts, ['item'], mode, axis);
      const p = result.placements.item;
      assert.equal(result.rows, rows + (rows - span) % 2);
      assert.equal(p.rowSpan, span);
      assert.equal(p._base.row - 1, result.rows - p._base.row - span + 1);
      close(p._rect.top, p._canvas.height - p._rect.top - p._rect.height);
      close(p._rect.height, layouts.item[mode]._rect.height);
      if (axis === 'vertical') {
        close(p._rect.left, layouts.item[mode]._rect.left);
        close(p._rect.width, layouts.item[mode]._rect.width);
      }
      const saved = savePlacement(item.attributes.canvas, layouts.item, mode, p);
      for (const other of Object.keys(COLUMNS).filter(key => key !== mode)) assert.deepEqual(saved[other], item.attributes.canvas[other]);
      const reopened = resolveCanvasLayouts([{ ...item, attributes: { canvas: saved } }, sibling], { ...g, [mode]: geometry(result.rows, gap)[mode] });
      sameFrame(reopened.item[mode], p);
      sameFrame(reopened.sibling[mode], layouts.sibling[mode]);
      const again = centerSelection(reopened, ['item'], mode, axis);
      assert.equal(again.rows, result.rows);
      sameFrame(again.placements.item, p);
    }
  }
});

test('horizontal and Freeform centering never change rows', () => {
  const layouts = resolveCanvasLayouts([block('item', 5)], geometry(12));
  const horizontal = centerSelection(layouts, ['item'], 'desktop', 'horizontal');
  assert.equal(horizontal.rows, 12);
  close(horizontal.placements.item._rect.top, layouts.item.desktop._rect.top);
  for (const axis of ['vertical', 'both']) {
    const result = centerSelection(layouts, ['item'], 'desktop', axis, { cells: false });
    assert.equal(result.rows, 12);
    close(result.placements.item._rect.top + result.placements.item._rect.height / 2, layouts.item.desktop._canvas.height / 2);
  }
});

test('centering retains content-expanded rows even when no extra row is needed', () => {
  const item = block('item', 4, 17), minimums = { desktop: 12, tablet: 1, mobile: 1 };
  const expandedRows = sectionRows([item], minimums).desktop;
  assert.equal(expandedRows, 20);
  const layouts = resolveCanvasLayouts([item], geometry(expandedRows));
  const result = centerSelection(layouts, ['item'], 'desktop', 'vertical');
  assert.equal(result.rows, expandedRows);
  const saved = { ...item, attributes: { canvas: savePlacement(item.attributes.canvas, layouts.item, 'desktop', result.placements.item) } };
  // Saving only the moved block loses the rows that its old position required.
  assert.equal(sectionRows([saved], minimums).desktop, 12);
  const retained = sectionRows([saved], { ...minimums, desktop: result.rows }).desktop;
  assert.equal(retained, 20);
  const reopened = resolveCanvasLayouts([saved], geometry(retained)).item.desktop;
  sameFrame(reopened, result.placements.item);
  close(reopened._rect.top, reopened._canvas.height - reopened._rect.top - reopened._rect.height);
});

test('shared row growth centers compatible spans and leaves mixed parity stable', () => {
  for (const spans of [[3, 5], [4, 5]]) {
    const layouts = resolveCanvasLayouts(spans.map((span, i) => block(`item${i}`, span)), geometry(12));
    const ids = Object.keys(layouts), result = centerSelection(layouts, ids, 'desktop', 'vertical');
    assert.equal(result.rows, spans[0] === 3 ? 13 : 12);
    for (const id of ids) close(result.placements[id]._rect.height, layouts[id].desktop._rect.height);
    const nextLayouts = Object.fromEntries(ids.map(id => [id, { desktop: result.placements[id] }]));
    assert.equal(centerSelection(nextLayouts, ids, 'desktop', 'vertical').rows, result.rows);
  }
});

test('asymmetric padding and the row limit do not cause repeated growth', () => {
  for (const [rows, top, bottom] of [[12, 37, 61], [MAX_ROWS, 24, 24]]) {
    const layouts = resolveCanvasLayouts([block('item', 5)], geometry(rows, 12, top, bottom));
    const result = centerSelection(layouts, ['item'], 'desktop', 'vertical');
    assert.equal(result.rows, rows);
    close(result.placements.item._rect.height, layouts.item.desktop._rect.height);
    assert.equal(centerSelection({ item: { desktop: result.placements.item } }, ['item'], 'desktop', 'vertical').rows, rows);
  }
});

test('centering a group grows rows while preserving child sizes and spacing', () => {
  const children = [block('a', 2, 2), block('b', 2, 5)];
  for (const child of children) for (const placement of Object.values(child.attributes.canvas)) delete placement.rotation;
  const group = { clientId: 'group', name: 'core/group', attributes: { canvas: { group: 1 } }, innerBlocks: children };
  const layouts = resolveCanvasLayouts([group], geometry(12, 12));
  const result = centerSelection(layouts, ['group'], 'desktop', 'vertical');
  assert.equal(result.rows, 13);
  const saved = { ...group, attributes: { canvas: saveGroupMove(group.attributes.canvas, layouts.group.desktop, result.placements.group, 'desktop') } };
  const reopened = resolveCanvasLayouts([saved], geometry(result.rows, 12));
  sameFrame(reopened.group.desktop, result.placements.group);
  for (const id of ['a', 'b']) {
    close(reopened[id].desktop._rect.width, layouts[id].desktop._rect.width);
    close(reopened[id].desktop._rect.height, layouts[id].desktop._rect.height);
  }
  close(reopened.b.desktop._rect.top - reopened.a.desktop._rect.top, layouts.b.desktop._rect.top - layouts.a.desktop._rect.top);
});

test('centering a child inside a translated group saves its source row once', () => {
  const child = block('item', 5);
  const group = { clientId: 'group', name: 'core/group', attributes: { canvas: { group: 1, offset: { desktop: { x: .03, y: 1 } } } }, innerBlocks: [child] };
  const layouts = resolveCanvasLayouts([group], geometry(12));
  const result = centerSelection(layouts, ['item'], 'desktop', 'vertical');
  assert.equal(result.rows, 13);
  const saved = savePlacement(child.attributes.canvas, layouts.item, 'desktop', sourcePlacement(result.placements.item, 'desktop', layouts.item.desktop));
  const reopened = resolveCanvasLayouts([{ ...group, innerBlocks: [{ ...child, attributes: { canvas: saved } }] }], geometry(result.rows));
  sameFrame(reopened.item.desktop, result.placements.item);
});
