import { compactCanvas, serializePlacement } from '../src/serialization.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRotation, rotationAtPointer } from '../src/rotation.mjs';
import { ATTRIBUTE, duplicateLayout, normalizePlacement, resolveLayouts, savePlacement, layoutVariables } from '../src/geometry.mjs';
import { canvasColumns, canvasRows, dragCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';

const point = (degrees) => ({ x: 100 + 80 * Math.cos(degrees * Math.PI / 180), y: 100 + 80 * Math.sin(degrees * Math.PI / 180) });
const center = { x: 100, y: 100 };
const desktop = { column: 4, columnSpan: 8, row: 3, rowSpan: 4, rotation: 20 };
const block = (saved) => ({ clientId: 'a', name: 'core/paragraph', attributes: { [ATTRIBUTE]: saved } });

test('rotation follows the pointer in both directions and across the angle boundary', () => {
  assert.equal(rotationAtPointer(20, point(-45), point(15), center), 80);
  assert.equal(rotationAtPointer(20, point(-45), point(-105), center), -40);
  assert.equal(rotationAtPointer(20, point(179), point(-179), center), 22);
  assert.equal(rotationAtPointer(0, point(0), point(38), center, true), 45);
  assert.equal(rotationAtPointer(20, point(0), center, center), 20);
  for (const value of [NaN, Infinity, 'bad', undefined]) assert.equal(normalizeRotation(value), 0);
  assert.equal(normalizeRotation(725), 5);
  assert.equal(normalizeRotation(-725), -5);
  assert.equal(normalizePlacement({ rotation: Infinity }).rotation, 0);
});

test('rotation saves only the edited viewport and survives serialization and duplication', () => {
  const saved = { desktop, mobile: { ...desktop, column: 2, columnSpan: 3, rotation: -15 }, fitArea: true };
  const layout = resolveLayouts([block(saved)]).a;
  const edited = savePlacement(saved, layout, 'tablet', { ...layout.tablet, rotation: 45 });
  assert.deepEqual(edited.desktop, desktop);
  assert.deepEqual(edited.mobile, saved.mobile);
  assert.equal(edited.fitArea, true);
  const reopened = resolveLayouts([block(JSON.parse(JSON.stringify(edited)))]).a;
  assert.equal(reopened.tablet.rotation, 45);
  const duplicate = duplicateLayout(reopened, edited);
  assert.equal(duplicate.desktop.rotation, 20);
  assert.equal(duplicate.tablet.rotation, 45);
  assert.equal(duplicate.mobile.rotation, -15);
});

test('automatic viewports inherit current angles instead of stale measured angles', () => {
  const geometry = Object.fromEntries(['tablet', 'mobile'].map((mode) => [mode, { automatic: { 0: { ...desktop, rotation: -10 } } }]));
  const layout = resolveLayouts([block({ desktop })], geometry).a;
  assert.equal(layout.tablet.rotation, 20);
  assert.equal(layout.mobile.rotation, 20);
  const manual = resolveLayouts([block({ desktop, tablet: { ...desktop, rotation: 0 } })], geometry).a;
  assert.equal(manual.mobile.rotation, 0);
});

test('rotating mapped canvas placements preserves anchors and persists through moving and resizing', () => {
  const pad = { left: 20, right: 20, top: 20, bottom: 20 };
  const g = { ...canvasColumns(1200, pad, 100, 1100, 12, 'desktop'), ...canvasRows(20, 20, 12, 12), gap: 12 };
  const saved = { desktop: { ...desktop, anchors: { ...(desktop).anchors, left: 2, right: 10 } } };
  const layout = resolveLayouts([block(saved)], { desktop: g }).a;
  const edited = savePlacement(saved, layout, 'desktop', { ...layout.desktop, rotation: -35 });
  assert.deepEqual(edited.desktop, serializePlacement({ ...savedCanvasPlacement(layout.desktop), rotation: -35 }, 'desktop'));
  assert.ok(Object.keys(edited.desktop).every((key) => !key.startsWith('_')));
  const reopened = resolveLayouts([block(edited)], { desktop: g }).a;
  assert.equal(layoutVariables(reopened)['--canvas-desktop-rotation'], -35);
  for (const kind of ['move', 'se']) {
    const moved = dragCanvasPlacement(reopened.desktop, 'desktop', kind, 50, 36, { columnSpan: 1, rowSpan: 1 });
    assert.equal(savedCanvasPlacement(moved).rotation, -35);
  }
});
