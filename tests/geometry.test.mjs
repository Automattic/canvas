import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlacement, resolveLayouts, requiredRows, changeViewport, nudge, reorderLayer, minimumSpans, mapPlacement } from '../src/geometry.mjs';
import { canvasColumns, canvasRows, dragCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { columnTracks } from '../src/columns.mjs';

test('clamps malformed placements to finite, one-based grid bounds', () => {
  assert.deepEqual(normalizePlacement({ column: -10, row: Infinity, columnSpan: 99, rowSpan: 0, layer: -1 }, 'mobile'), { column: 1, row: 1, columnSpan: 12, rowSpan: 1, layer: -1, gridColumns: 12, anchors: {} });
  const edge = normalizePlacement({ column: 24, columnSpan: 12, row: 500, rowSpan: 6 });
  assert.equal(edge.column, 13);
  assert.equal(edge.row, 495);
  assert.equal(normalizePlacement(null, 'mobile').columnSpan, 12);
});

test('new items append to the desktop layout and inherit into smaller viewports', () => {
  const layouts = resolveLayouts([
    { clientId: 'a', attributes: { canvas: { desktop: { row: 9, rowSpan: 8 }, mobile: { row: 1, rowSpan: 3 } } } },
    { clientId: 'b', attributes: {} },
  ]);
  assert.equal(layouts.b.desktop.row, 17);
  assert.equal(layouts.b.tablet.row, 17);
  assert.equal(layouts.b.mobile.row, 17);
  assert.equal(layouts.b.desktop.columnSpan, 12);
  assert.equal(layouts.b.mobile.columnSpan, 6);
  assert.equal(requiredRows(layouts, 'desktop'), 22);
});

test('editing desktop preserves mobile position and image fit', () => {
  const initial = resolveLayouts([{ clientId: 'a', name: 'core/image', attributes: {} }]).a;
  const changed = changeViewport(initial, 'desktop', { ...initial.desktop, column: 4, rowSpan: 10 });
  assert.deepEqual(changed.mobile, initial.mobile);
  assert.equal(changed.fill, true);
  assert.equal(initial.desktop.column, 1);
});

test('moving at edges clamps without shrinking an item', () => {
  const placement = normalizePlacement({ columnSpan: 5, rowSpan: 4 });
  assert.equal(nudge(placement, 'desktop', -10, -10).column, 1);
  assert.equal(nudge(placement, 'desktop', 100, 100).column, 20);
  assert.equal(nudge(placement, 'desktop', 100, 100).columnSpan, 5);
});

test('layer changes handle duplicate layer values and preserve source order and other viewport', () => {
  const layouts = resolveLayouts(['a', 'b', 'c'].map((clientId) => ({ clientId, attributes: {} })));
  layouts.b.desktop.layer = layouts.a.desktop.layer;
  const changed = reorderLayer(layouts, 'a', 'desktop', 1);
  assert.ok(changed.a.desktop.layer > changed.b.desktop.layer);
  assert.deepEqual(changed.a.mobile, layouts.a.mobile);
  assert.deepEqual(Object.keys(layouts), ['a', 'b', 'c']);
});

test('sending to an edge preserves every other item and the other viewport', () => {
  const layouts = resolveLayouts(['a', 'b', 'c', 'd'].map((clientId) => ({ clientId, attributes: {} })));
  const order = (values, mode) => Object.keys(values).sort((a, b) => values[a][mode].layer - values[b][mode].layer);
  const front = reorderLayer(layouts, 'b', 'desktop', 4);
  assert.deepEqual(order(front, 'desktop'), ['a', 'c', 'd', 'b']);
  const back = reorderLayer(layouts, 'c', 'mobile', -4);
  assert.deepEqual(order(back, 'mobile'), ['c', 'a', 'b', 'd']);
  for (const id of Object.keys(layouts)) {
    assert.deepEqual(front[id].mobile, layouts[id].mobile);
    assert.deepEqual(back[id].desktop, layouts[id].desktop);
    assert.deepEqual({ ...front[id].desktop, layer: layouts[id].desktop.layer }, layouts[id].desktop);
  }
  assert.deepEqual(order(layouts, 'desktop'), ['a', 'b', 'c', 'd']);
});

test('layer actions at either edge and missing items are no-ops', () => {
  const layouts = resolveLayouts(['a', 'b'].map((clientId) => ({ clientId, attributes: {} })));
  assert.equal(reorderLayer(layouts, 'a', 'desktop', -1), layouts);
  assert.equal(reorderLayer(layouts, 'a', 'desktop', -2), layouts);
  assert.equal(reorderLayer(layouts, 'b', 'desktop', 1), layouts);
  assert.equal(reorderLayer(layouts, 'b', 'desktop', 2), layouts);
  assert.equal(reorderLayer(layouts, 'missing', 'desktop', 1), layouts);
});

test('undersized buttons resolve to four columns and two rows in both viewports, within bounds', () => {
  const small = { column: 24, row: 500, columnSpan: 1, rowSpan: 1 };
  const layouts = resolveLayouts(['core/buttons', 'core/paragraph'].map((name) => ({
    clientId: name, name, attributes: { canvas: { desktop: small, mobile: small } },
  })));
  for (const [mode, columns] of [['desktop', 24], ['mobile', 12]]) {
    assert.deepEqual(Object.fromEntries(['column','row','columnSpan','rowSpan','layer'].map(key => [key, layouts['core/buttons'][mode][key]])), { column: columns - 3, row: 499, columnSpan: 4, rowSpan: 2, layer: 1 });
    assert.equal(layouts['core/buttons'][mode].gridColumns, columns);
    assert.equal(layouts['core/paragraph'][mode].columnSpan, 1);
    assert.equal(layouts['core/paragraph'][mode].rowSpan, 1);
  }
});

test('placement updates enforce button minimums without changing the other viewport', () => {
  const initial = resolveLayouts([{ clientId: 'button', name: 'core/buttons', attributes: {} }]).button;
  const changed = changeViewport(initial, 'desktop', { ...initial.desktop, columnSpan: 1, rowSpan: 1 }, minimumSpans('core/buttons'));
  assert.equal(changed.desktop.columnSpan, 4);
  assert.equal(changed.desktop.rowSpan, 2);
  assert.deepEqual(changed.mobile, initial.mobile);
});

test('bounded grids cover the canvas with equal cells at every width and spacing', () => {
  for (const mode of ['desktop', 'mobile']) for (const [width, left, right, gap] of [[1672, 166, 166, 12], [2500, 590, 570, 0], [1600, 70, 400, 64], [900, 0, 0, 12], [400, 3, 5, 12]]) {
    const count = mode === 'desktop' ? 24 : 12;
    const cells = columnTracks(width, gap, count);
    const expected = cells[0].end;
    assert.equal(cells.length, count);
    for (const cell of cells) assert.ok(Math.abs(cell.end - cell.start - expected) < 0.001);
    assert.equal(cells[0].start, 0);
    assert.ok(Math.abs(cells.at(-1).end - width) < 0.001);
  }
});

const measured = (width, left, right, mode = 'desktop') => ({
  ...canvasColumns(width, { top:0, bottom:0, left:0, right:0 }, left, width-right, 12, mode),
  ...canvasRows(0,0,12,12), gap:12,
});

test('expanding to both canvas edges stays within the maximum column count', () => {
  const geometry = measured(2000,330,330);
  const start = mapPlacement(normalizePlacement({ column:1, columnSpan:24 }), 'desktop', geometry);
  const right = dragCanvasPlacement(start,'desktop','e',1000,0,minimumSpans('core/paragraph'));
  const full = dragCanvasPlacement(right,'desktop','w',-1000,0,minimumSpans('core/paragraph'));
  assert.equal(full.column,1);
  assert.equal(full.columnSpan,geometry.columns.length);
  assert.equal(full.columnSpan,24);
  const saved=savedCanvasPlacement(full);
  assert.equal(saved.anchors?.left,'canvas');
  assert.equal(saved.anchors?.right,'canvas');
  assert.equal(mapPlacement(saved,'desktop',measured(900,0,0)).columnSpan,24);
});

test('outside anchors survive clipping, row edits and reopening', () => {
  const wide=measured(2000,330,330);
  const saved={ column:1, columnSpan:24, row:2, rowSpan:4, anchors: { left: -1, right: 25 } };
  const placement=mapPlacement(saved,'desktop',wide);
  const narrow=mapPlacement(saved,'desktop',measured(900,0,0));
  const moved=dragCanvasPlacement(narrow,'desktop','move',0,36,minimumSpans('core/paragraph'),0);
  const reopened=mapPlacement(JSON.parse(JSON.stringify(savedCanvasPlacement(moved))),'desktop',wide);
  assert.equal(reopened.column,placement.column);
  assert.equal(reopened.columnSpan,placement.columnSpan);
  assert.equal(reopened.row,3);
});

test('canvas edges falling in gutters remain reachable', () => {
  const geometry=measured(400,3,5,'mobile');
  const start=mapPlacement(normalizePlacement({column:2,columnSpan:10},'mobile'),'mobile',geometry);
  const right=dragCanvasPlacement(start,'mobile','e',100,0,minimumSpans('core/paragraph'));
  const full=dragCanvasPlacement(right,'mobile','w',-100,0,minimumSpans('core/paragraph'));
  assert.equal(full._rect.left,0);
  assert.equal(full._rect.width,400);
});
