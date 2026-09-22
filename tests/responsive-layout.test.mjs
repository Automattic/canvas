import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE, COLUMNS, duplicateLayout, projectPlacement, minimumRows, minimumSpans, requiredRows, resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { canvasColumns, canvasRows } from '../src/canvas-geometry.mjs';

const desktop = { column: 4, row: 3, columnSpan: 10, rowSpan: 4 };
const block = (saved, name = 'core/paragraph') => ({ clientId: 'a', name, attributes: { [ATTRIBUTE]: saved } });
const resolve = (saved, geometry) => resolveLayouts([block(saved)], geometry).a;

test('incomplete saved mobile overrides retain the default append position and layer', () => {
  const first = block({ desktop, mobile: { row: 20, rowSpan: 3 } });
  const second = { ...block({ desktop, mobile: { column: 3, columnSpan: 2 } }), clientId: 'b' };
  const layout = resolveLayouts([first, second]).b;
  assert.equal(layout.mobile.row, 23);
  assert.equal(layout.mobile.layer, 2);
  assert.equal(layout.tablet.row, desktop.row);
});

test('tablet inherits desktop; saving tablet changes only tablet and flows to uncustomized mobile', () => {
  const saved = { desktop, fit: 'contain', fitArea: true };
  const original = structuredClone(saved);
  const before = resolve(saved);
  assert.equal(before.tablet.gridColumns, 12);
  assert.equal(before.tablet.columnSpan, 5);
  assert.equal(before.tablet.row, desktop.row);
  const edited = savePlacement(saved, before, 'tablet', { ...before.tablet, column: 7, row: 9, rowSpan: 7 });
  assert.deepEqual(edited.desktop, desktop);
  assert.equal(edited.mobile, undefined);
  const after = resolve(edited);
  assert.equal(after.tablet.row, 9);
  assert.equal(after.mobile.row, 9);
  assert.equal(after.mobile.rowSpan, 7);
  assert.equal(after.mobile.layer, 1);
  assert.equal(after.mobile.column, 7);
  assert.deepEqual(saved, original);
});

test('existing mobile overrides survive tablet edits, serialization and duplication', () => {
  const mobile = { column: 2, row: 22, columnSpan: 3, rowSpan: 2 };
  const saved = { desktop, mobile, fit: 'contain' };
  const edited = savePlacement(saved, resolve(saved), 'tablet', { ...desktop, row: 40 });
  const reopened = JSON.parse(JSON.stringify(edited));
  assert.deepEqual(reopened.mobile, mobile);
  assert.equal(resolve(reopened).mobile.columnSpan, 3);
  assert.equal(resolve(reopened).mobile.gridColumns, 12);
  const duplicate = duplicateLayout(resolve(reopened), reopened);
  assert.equal(duplicate.desktop.row, desktop.row + 1);
  assert.equal(duplicate.tablet.row, 41);
  assert.equal(duplicate.mobile.row, 23);
  assert.equal(duplicate.mobile.column, 3);
  assert.equal(duplicate.fit, 'contain');
  assert.deepEqual(saved.mobile, mobile);
});

test('mobile edits and sparse duplication never freeze tablet inheritance', () => {
  const saved = { desktop };
  const mobileEdit = savePlacement(saved, resolve(saved), 'mobile', { ...resolve(saved).mobile, row: 28 });
  assert.deepEqual(mobileEdit.desktop, desktop);
  assert.equal(mobileEdit.tablet, undefined);
  assert.equal(resolve(mobileEdit).tablet.row, 3);
  const duplicate = duplicateLayout(resolve(saved), saved);
  assert.deepEqual(Object.keys(duplicate), ['desktop']);
  assert.equal(resolve(duplicate).mobile.row, 4);
  const mobileDuplicate = duplicateLayout(resolve(mobileEdit), mobileEdit);
  assert.equal(mobileDuplicate.tablet, undefined);
  assert.equal(mobileDuplicate.mobile.row, 29);
});

test('preview measurements preserve raw inheritance and mobile bounds at every width', () => {
  const saved = { desktop };
  for (const width of [320, 480, 481, 782, 783, 1440, 2400]) {
    const geometry = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, { ...canvasColumns(width, {top:0,bottom:0,left:0,right:0}, Math.max(0, (width - 1340) / 2), width - Math.max(0, (width - 1340) / 2), 12, mode), ...canvasRows(0,0,12,12), gap:12 }]));
    const layout = resolve(saved, geometry);
    assert.equal(layout.tablet.gridColumns, 12);
    assert.equal(layout.desktop.gridColumns, 24);
    assert.equal(layout.tablet.row, layout.desktop.row);
    assert.equal(layout.tablet._base.columnSpan, layout.desktop._base.columnSpan / 2);
    assert.ok(layout.mobile.column >= 1);
    assert.ok(layout.mobile.column + layout.mobile.columnSpan - 1 <= geometry.mobile.columns.length);
    assert.deepEqual(saved, { desktop });
  }
});

test('projection respects full edges and button minimums even at clipped outer anchors', () => {
  const full = projectPlacement({ ...desktop, column: 1, columnSpan: 24 }, 'desktop', 'mobile');
  assert.equal(full.column, 1);
  assert.equal(full.columnSpan, 12);
  assert.equal(full.gridColumns, 12);
  for (const column of [1, 3, 15, 24]) {
    const mobile = projectPlacement({ ...desktop, column, columnSpan: 1 }, 'desktop', 'mobile', minimumSpans('core/buttons'));
    assert.equal(mobile.columnSpan, 4);
    assert.ok(mobile.column + mobile.columnSpan - 1 <= 12);
  }
});

test('automatic occupied height grows and shrinks without changing saved minimums', () => {
  const attributes = { desktopRows: 12, mobileRows: 20 };
  const saved = { desktop };
  assert.equal(minimumRows(attributes, 'tablet'), 1);
  const taller = savePlacement(saved, resolve(saved), 'tablet', { ...desktop, row: 30 });
  assert.equal(Math.max(minimumRows(attributes, 'tablet'), requiredRows({ a: resolve(taller) }, 'tablet')), 33);
  const shorter = savePlacement(taller, resolve(taller), 'tablet', { ...desktop, row: 2 });
  assert.equal(Math.max(minimumRows(attributes, 'tablet'), requiredRows({ a: resolve(shorter) }, 'tablet')), 5);
  assert.equal(minimumRows({ ...attributes, tabletRows: 18 }, 'tablet'), 18);
  assert.deepEqual(attributes, { desktopRows: 12, mobileRows: 20 });
});
