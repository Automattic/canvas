import { assertNearestRowCenter } from './helpers/snapped-placement.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE, COLUMNS, MAX_ROWS, rowPitch } from '../src/placement.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveCanvasLayouts, saveGroupMove, sourcePlacement } from '../src/canvas-groups.mjs';
import { savePlacement } from '../src/geometry.mjs';
import { canMoveSelection, moveSelection, centerInSection } from '../src/selection-movement.mjs';
const padding = { top: 24, right: 24, bottom: 24, left: 24 };
const geometry = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, {
  ...canvasColumns(1200, padding, 100, 1100, 12, mode), ...canvasRows(24, 24, 24, 12), gap: 12,
}]));
const leaf = (id, column, row) => ({ clientId: id, name: 'core/paragraph', attributes: {
  [ATTRIBUTE]: { desktop: { gridColumns: 24, column, columnSpan: 4, row, rowSpan: 3, rotation: 13 } },
}, innerBlocks: [] });
const almost = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
// Only saved free-frame comparisons allow six-decimal rounding.
const savedTolerance = .01;
const a = leaf('a', 3, 3), b = leaf('b', 12, 8);
for (const mode of Object.keys(COLUMNS)) {
  test(`${mode}: shared movement preserves frames and survives serialization`, () => {
    const layouts = resolveCanvasLayouts([a, b], geometry);
    for (const snap of [false, true]) {
      const moved = moveSelection(layouts, ['a', 'b'], mode, 'b', 37, 63, { snap });
      const delta = id => [moved[id]._rect.left - layouts[id][mode]._rect.left, moved[id]._rect.top - layouts[id][mode]._rect.top];
      delta('a').forEach((value, index) => almost(value, delta('b')[index]));
      const saved = [a, b].map(block => ({ ...block, attributes: { [ATTRIBUTE]: savePlacement(block.attributes[ATTRIBUTE], layouts[block.clientId], mode, sourcePlacement(moved[block.clientId], mode, layouts[block.clientId][mode])) } }));
      const reopened = resolveCanvasLayouts(saved, geometry);
      for (const id of ['a', 'b']) {
        for (const key of ['width', 'height']) almost(moved[id]._rect[key], layouts[id][mode]._rect[key]);
        for (const key of ['left', 'top', 'width', 'height']) almost(reopened[id][mode]._rect[key], moved[id]._rect[key], savedTolerance);
        assert.equal(moved[id].rotation, layouts[id][mode].rotation);
        assert.equal(moved[id].layer, layouts[id][mode].layer);
      }
      if (mode !== 'desktop') assert.deepEqual(saved[0].attributes[ATTRIBUTE].desktop, a.attributes[ATTRIBUTE].desktop);
    }
  });
}

test('vertical centering preserves block size and the existing canvas cells', () => {
  for (const gap of [0, 12, 24]) for (const [rows, span] of [[12, 5], [11, 4], [12, 6], [1, 1], [2, 1]]) {
    const inset = { top: 0, bottom: 0, left: 0, right: 0 };
    const g = { ...canvasColumns(1200, inset, 0, 1200, gap, 'desktop'), ...canvasRows(0, 0, rows, gap), gap };
    const start = mapCanvasPlacement({ column: 3, columnSpan: 4, row: 1, rowSpan: span }, 'desktop', g);
    const centered = centerInSection(start, 'desktop', 'vertical');
    almost(centered._rect.height, start._rect.height);
    assertNearestRowCenter(centered);
    almost(centered._rect.left, start._rect.left);
    almost(centered._rect.width, start._rect.width);
    assert.equal(centered._canvas, g);
    assert.equal(centered.free?.anchorY, undefined);
    const again = centerInSection(centered, 'desktop', 'vertical');
    assert.deepEqual(again._rect, centered._rect, 'Repeated centering must not keep growing the block');
  }
});

test('centering an inherited precise frame first resolves both axes to cells', () => {
  const g=geometry.desktop;
  const start=mapCanvasPlacement({free:{x:.173,y:2.375,width:.231,ratio:1.4},rotation:23},'desktop',g);
  for(const axis of ['horizontal','vertical','both']) {
   const p=centerInSection(start,'desktop',axis),r=p._rect;
   assert.equal(p.free,undefined);
   for(const [tracks,edge,value]of[[g.columns,'start',r.left],[g.columns,'end',r.left+r.width],[g.rows,'start',r.top],[g.rows,'end',r.top+r.height]])assert.ok(tracks.some(t=>Math.abs(t[edge]-value)<1e-7));
   if(axis!=='horizontal')assertNearestRowCenter(p);
   assert.equal(p.rotation,23);
  }
});
test('whole-selection bounds preserve spacing at every edge, including after snapping', () => {
  const layouts = resolveCanvasLayouts([a, b], geometry), mode = 'desktop';
  for (const [dx, dy] of [[-10000, 0], [10000, 0], [0, -10000], [0, 100000]]) {
    const moved = moveSelection(layouts, ['a', 'b'], mode, 'a', dx, dy, { snap: true });
    almost(moved.b._rect.left - moved.a._rect.left, layouts.b[mode]._rect.left - layouts.a[mode]._rect.left);
    almost(moved.b._rect.top - moved.a._rect.top, layouts.b[mode]._rect.top - layouts.a[mode]._rect.top);
    for (const p of Object.values(moved)) {
      assert.ok(p._rect.left >= 0 && p._rect.left + p._rect.width <= 1200 + 1e-7);
      assert.ok(p._rect.top >= 0 && p._rect.top + p._rect.height <= 24 + MAX_ROWS * rowPitch(p._canvas) - p._canvas.gap + 1e-7);
    }
  }
});
test('a selected Group moves descendants once alongside an independent sibling', () => {
  const g = { clientId: 'g', name: 'core/group', attributes: { [ATTRIBUTE]: { group: 1 } }, innerBlocks: [a] };
  const layouts = resolveCanvasLayouts([g, b], geometry);
  const moved = moveSelection(layouts, ['g', 'b'], 'desktop', 'g', 17, 31, { snap: true });
  const saved = [{ ...g, attributes: { [ATTRIBUTE]: saveGroupMove(g.attributes[ATTRIBUTE], layouts.g.desktop, moved.g, 'desktop') } },
    { ...b, attributes: { [ATTRIBUTE]: savePlacement(b.attributes[ATTRIBUTE], layouts.b, 'desktop', moved.b) } }];
  const reopened = resolveCanvasLayouts(saved, geometry);
  almost(reopened.a.desktop._rect.left - layouts.a.desktop._rect.left, reopened.b.desktop._rect.left - layouts.b.desktop._rect.left, savedTolerance);
  almost(reopened.a.desktop._rect.top - layouts.a.desktop._rect.top, reopened.b.desktop._rect.top - layouts.b.desktop._rect.top, savedTolerance);
});
test('zero movement leaves placements untouched', () => {
  const layouts = resolveCanvasLayouts([a, b], geometry);
  const moved = moveSelection(layouts, ['a', 'b'], 'desktop', 'a', 0, 0, { snap: true });
  assert.equal(moved.a, layouts.a.desktop); assert.equal(moved.b, layouts.b.desktop);
});
test('selection validation rejects mixed parents, locked ancestors and restricted modes', () => {
  const parents = { a: ['g', 'canvas'], b: ['g', 'canvas'], g: ['canvas'], canvas: [] };
  const attributes = {};
  const store = { getBlockRootClientId: id => parents[id][0], getBlockParents: id => parents[id], canMoveBlocks: () => true,
    getBlockAttributes: id => attributes[id], getTemplateLock: () => false, getBlockEditingMode: () => 'default' };
  assert.equal(canMoveSelection(store, ['a', 'b'], 'canvas'), true);
  attributes.g = { lock: { move: true } };
  assert.equal(canMoveSelection(store, ['a', 'b'], 'canvas'), false);
  delete attributes.g;
  parents.b = ['canvas']; assert.equal(canMoveSelection(store, ['a', 'b'], 'canvas'), false);
  parents.b = ['g', 'canvas']; store.getBlockEditingMode = id => id === 'b' ? 'contentOnly' : 'default';
  assert.equal(canMoveSelection(store, ['a', 'b'], 'canvas'), false);
});
test('mixed image and text sizes retain dimensions, ratios and spacing', () => {
  const image = { ...b, name: 'core/image', attributes: { url: 'test.jpg', [ATTRIBUTE]: { ...b.attributes[ATTRIBUTE], desktop: { ...b.attributes[ATTRIBUTE].desktop, columnSpan: 7, rowSpan: 5, frameRatio: 1.7 }, shape: 'none' } } };
  const layouts = resolveCanvasLayouts([a, image], geometry);
  const moved = moveSelection(layouts, ['a', 'b'], 'desktop', 'a', 55, 39, { snap: true });
  for (const id of ['a', 'b']) for (const key of ['width', 'height']) almost(moved[id]._rect[key], layouts[id].desktop._rect[key]);
  const saved = savePlacement(image.attributes[ATTRIBUTE], layouts.b, 'desktop', moved.b);
  almost(saved.desktop.frameRatio, layouts.b.desktop.frameRatio);
  almost(moved.b._rect.left - moved.a._rect.left, layouts.b.desktop._rect.left - layouts.a.desktop._rect.left);
});
test('selected siblings inside a translated Group save source coordinates without doubled offsets', () => {
  const g = { clientId: 'g', name: 'core/group', attributes: { [ATTRIBUTE]: { group: 1, offset: { desktop: { x: .03, y: 1.25 } } } }, innerBlocks: [a, b] };
  const layouts = resolveCanvasLayouts([g], geometry);
  const moved = moveSelection(layouts, ['a', 'b'], 'desktop', 'b', 25, 47, { snap: true });
  const children = [a, b].map(block => ({ ...block, attributes: { [ATTRIBUTE]: savePlacement(block.attributes[ATTRIBUTE], layouts[block.clientId], 'desktop', sourcePlacement(moved[block.clientId], 'desktop', layouts[block.clientId].desktop)) } }));
  const reopened = resolveCanvasLayouts([{ ...g, innerBlocks: children }], geometry);
  for (const id of ['a', 'b']) for (const key of ['left', 'top', 'width', 'height']) almost(reopened[id].desktop._rect[key], moved[id]._rect[key], savedTolerance);
});

for (const axis of ['horizontal', 'vertical', 'both']) {
test(`${axis} centering preserves the other axis and rotation after saving`, () => {
  for (const mode of Object.keys(COLUMNS)) {
    const layouts = resolveCanvasLayouts([a], geometry);
    const start = layouts.a[mode];
    const centered = centerInSection(start, mode, axis);
    if (axis === 'vertical') almost(centered._rect.left, start._rect.left);
    else almost(centered._rect.left + centered._rect.width / 2, start._canvas.width / 2);
    if (axis === 'horizontal') almost(centered._rect.top, start._rect.top);
    else assertNearestRowCenter(centered);
    if (axis === 'vertical') almost(centered._rect.width, start._rect.width);
    almost(centered._rect.height, start._rect.height);
    const { _rect: rect, _canvas: g } = centered;
    for (const [tracks, edge, value] of [
      ...(axis !== 'vertical' ? [[g.columns, 'start', rect.left], [g.columns, 'end', rect.left + rect.width]] : []),
    ]) assert.ok(tracks.some(track => Math.abs(track[edge] - value) < 1e-7));
    assert.equal(centered.free?.anchorY, undefined);
    assert.equal(centered._canvas.coreRows, start._canvas.coreRows);
    assert.equal(centered.rotation, start.rotation);
    const saved = { ...a, attributes: { [ATTRIBUTE]: savePlacement(a.attributes[ATTRIBUTE], layouts.a, mode, centered) } };
    const reopened = resolveCanvasLayouts([saved], geometry).a[mode];
    for (const key of ['left', 'top', 'width', 'height']) almost(reopened._rect[key], centered._rect[key], savedTolerance);
    if (mode !== 'desktop') assert.deepEqual(saved.attributes[ATTRIBUTE].desktop, a.attributes[ATTRIBUTE].desktop);
  }
});

test(`${axis} centering moves a group without changing the other axis, child sizes or spacing`, () => {
  const group = { clientId: 'g', name: 'core/group', attributes: { [ATTRIBUTE]: { group: 1 } }, innerBlocks: [a, b] };
  const layouts = resolveCanvasLayouts([group], geometry);
  const centered = centerInSection(layouts.g.desktop, 'desktop', axis, { preserveSize: true });
  const saved = { ...group, attributes: { [ATTRIBUTE]: saveGroupMove(group.attributes[ATTRIBUTE], layouts.g.desktop, centered, 'desktop') } };
  const reopened = resolveCanvasLayouts([saved], geometry);
  if (axis === 'vertical') almost(reopened.g.desktop._rect.left, layouts.g.desktop._rect.left);
  else assert.ok(geometry.desktop.columns.some(cell=>Math.abs(cell.start-reopened.g.desktop._rect.left)<.01));
  if (axis === 'horizontal') almost(reopened.g.desktop._rect.top, layouts.g.desktop._rect.top);
  else assert.ok(geometry.desktop.rows.some(cell=>Math.abs(cell.start-reopened.g.desktop._rect.top)<.01));
  for (const id of ['a', 'b']) {
    almost(reopened[id].desktop._rect.width, layouts[id].desktop._rect.width);
    almost(reopened[id].desktop._rect.height, layouts[id].desktop._rect.height);
  }
  almost(reopened.a.desktop._rect.top - reopened.b.desktop._rect.top, layouts.a.desktop._rect.top - layouts.b.desktop._rect.top);
  almost(reopened.a.desktop._rect.left - reopened.b.desktop._rect.left, layouts.a.desktop._rect.left - layouts.b.desktop._rect.left);
});
}
