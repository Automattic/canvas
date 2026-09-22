import { compactCanvas, serializePlacement } from '../src/serialization.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE, resolveLayouts } from '../src/geometry.mjs';
import { droppedLayouts, owningGridItem, placementRectangle } from '../src/drop-layout.mjs';
import { canvasColumns, canvasRows } from '../src/canvas-geometry.mjs';

const measured = (mode = 'desktop', width = 996, inset = 0) => {
  const canvas = { ...canvasColumns(width, {top:0,bottom:0,left:0,right:0},inset,width-inset,12,mode), ...canvasRows(0,0,12,12),gap:12 };
  return { ...canvas, mode, geometry:{[mode]:canvas} };
};
const metrics = measured();
const block = (id, name = 'core/image', attributes = {}) => ({ clientId: id, name, attributes });

test('descendants resolve to the owning grid item; unrelated and cyclic trees do not', () => {
  const parents = { label: 'buttons', buttons: 'group', group: 'canvas', elsewhere: 'root', a: 'b', b: 'a' };
  const parent = (id) => parents[id];
  assert.equal(owningGridItem('label', 'canvas', parent), 'group');
  assert.equal(owningGridItem('buttons', 'group', parent), 'buttons');
  assert.equal(owningGridItem('canvas', 'canvas', parent), null);
  assert.equal(owningGridItem('elsewhere', 'canvas', parent), null);
  assert.equal(owningGridItem('a', 'canvas', parent), null);
});

test('new drops snap to measured cells without freezing inherited viewports', () => {
  const existing = [block('old')];
  const next = droppedLayouts(existing, [block('new')], 'desktop', { x: 85, y: 149 }, metrics).new;
  assert.equal(placementRectangle(next.desktop, metrics).left, metrics.columns[2].start);
  assert.equal(next.desktop.row, 5);
  assert.equal(next.tablet, undefined);
  assert.equal(next.mobile, undefined);
  assert.equal(resolveLayouts([block('new', 'core/image', { [ATTRIBUTE]: next })]).new.mobile.row, 5);
  assert.deepEqual(placementRectangle(next.desktop, metrics), { left: metrics.columns[2].start, top: 144, width: metrics.columns[9].end - metrics.columns[2].start, height: 312 });
});

test('existing dimensions, layer, image options and other viewport survive a move', () => {
  const original = compactCanvas(resolveLayouts([block('a')]).a);
  original.layers = { desktop: 9 };
  original.desktop = { column: 2, row: 3, columnSpan: 4, rowSpan: 2 };
  original.fit = 'contain';
  const a = block('a', 'core/image', { [ATTRIBUTE]: original });
  const next = droppedLayouts([a], [a], 'desktop', { x: 99999, y: -10 }, metrics).a;
  const moved = resolveLayouts([block('a','core/image',{[ATTRIBUTE]:next})],metrics.geometry).a.desktop;
  assert.deepEqual([moved.column,moved.row,moved.columnSpan,moved.rowSpan,moved.layer],[21,1,4,2,9]);
  assert.deepEqual(next.mobile, original.mobile);
  assert.equal(next.fit, 'contain');
  assert.equal(a.attributes[ATTRIBUTE].desktop.column, 2);
});

test('multiple images stay separate, stack in input order and fit within the last row', () => {
  const next = droppedLayouts([], [block('a'), block('b'), block('c')], 'desktop', { x: 0, y: 999999 }, metrics);
  assert.deepEqual(Object.values(next).map((layout) => layout.desktop.row), [474, 483, 492]);
  const resolved = resolveLayouts(Object.entries(next).map(([id, layout]) => block(id, 'core/image', { [ATTRIBUTE]: layout })));
  assert.deepEqual(Object.values(resolved).map((layout) => layout.mobile.row), [474, 483, 492]);
});

test('unplaceable batches are rejected and explicit gutter tracks are excluded from snapping', () => {
  assert.equal(droppedLayouts([], Array.from({ length: 84 }, (_, i) => block(String(i))), 'desktop', { x: 0, y: 0 }, metrics), null);
  const next = droppedLayouts([], [block('a')], 'desktop', { x: 42, y: 0 }, metrics);
  assert.equal(placementRectangle(next.a.desktop, metrics).left, metrics.columns[1].start);
});

test('mobile drops preserve desktop and respect Buttons minimum spans', () => {
  const next = droppedLayouts([], [block('a', 'core/buttons', { [ATTRIBUTE]: { mobile: { columnSpan: 1, rowSpan: 1 }, desktop: { row: 12 } } })], 'mobile', { x: 9999, y: 0 }, measured('mobile',324)).a;
  const moved = resolveLayouts([block('a','core/buttons',{[ATTRIBUTE]:next})],measured('mobile',324).geometry).a.mobile;
  assert.deepEqual([moved.column,moved.columnSpan,moved.rowSpan],[9,4,2]);
  assert.equal(next.desktop.row, 12);
});

test('drops reach the canvas edge while respecting its column limit', () => {
  const desktop = measured('desktop',2400,530);
  const image = block('a', 'core/image', { [ATTRIBUTE]: { desktop: { column: 4, columnSpan: 2 } } });
  const next = droppedLayouts([], [image], 'desktop', { x: 2300, y: 0 }, desktop).a;
  assert.equal(next.desktop.columns, undefined);
  assert.equal(next.desktop.anchors?.right, 'canvas');
  const reopened = resolveLayouts([block('a', 'core/image', { [ATTRIBUTE]: next })], { desktop }).a;
  assert.equal(reopened.desktop.column + reopened.desktop.columnSpan - 1, 24);
  assert.deepEqual(reopened.desktop._rect,placementRectangle(next.desktop,desktop));
  assert.equal(next.mobile, undefined);
  assert.ok(reopened.mobile.column + reopened.mobile.columnSpan - 1 <= reopened.mobile.gridColumns);
});
