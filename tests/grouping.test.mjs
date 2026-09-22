import test from 'node:test';
import assert from 'node:assert/strict';
import { canContain, rectanglePlacement, releasedLayout, replaceSelection, withoutGrid } from '../src/grouping.mjs';
import { ATTRIBUTE, COLUMNS } from '../src/placement.mjs';
import { resolveLayouts } from '../src/geometry.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';

const block = (id, attributes = {}, name = 'core/paragraph', innerBlocks = []) => ({ clientId: id, name, attributes, innerBlocks });
const padding = { top: 24, right: 24, bottom: 24, left: 24 };
const geometry = Object.fromEntries(Object.keys(COLUMNS).map((mode) => [mode, {
  ...canvasColumns(1200, padding, 100, 1100, 12, mode), ...canvasRows(24, 24, 12, 12), gap: 12,
}]));

test('native group gestures use measured height without saving it or retaining stale measurements', () => {
  const saved = { desktop: { gridColumns: 24, column: 2, columnSpan: 8, row: 2, rowSpan: 3 } };
  const group = block('card', { [ATTRIBUTE]: saved }, 'core/group');
  const measured = { ...geometry, desktop: { ...geometry.desktop, containers: {
    card: { source: JSON.stringify(saved), placement: { ...saved.desktop, rowSpan: 8 } },
  } } };
  assert.equal(resolveLayouts([group], measured).card.desktop.rowSpan, 8);
  assert.equal(saved.desktop.rowSpan, 3);
  const changed = { ...group, attributes: { [ATTRIBUTE]: { desktop: { ...saved.desktop, rowSpan: 5 } } } };
  assert.equal(resolveLayouts([changed], measured).card.desktop.rowSpan, 5);
});

test('noncontiguous wrapping preserves siblings and uses document order', () => {
  const siblings = ['a', 'b', 'c', 'd'].map((id) => block(id));
  const group = block('group');
  assert.deepEqual(replaceSelection(siblings, ['c', 'a'], [group]).map((item) => item.clientId), ['group', 'b', 'd']);
  assert.equal(siblings[0].clientId, 'a');
  assert.deepEqual(replaceSelection([group, siblings[1]], ['group'], [siblings[0], siblings[2]]).map((item) => item.clientId), ['a', 'c', 'b']);
});

test('releasing native flow children clears their grid metadata without altering content', () => {
  const child = block('text', { content: 'Price', style: { color: { text: '#333' } }, [ATTRIBUTE]: { fitArea: true, desktop: { rotation: 30 } } });
  const parent = block('container', { layout: { type: 'flex', orientation: 'vertical' }, [ATTRIBUTE]: { desktop: {} } }, 'core/group', [child]);
  const group = block('group', { layout: { type: 'flex' } }, 'core/group', [parent]);
  const [clean] = group.innerBlocks.map(withoutGrid);
  assert.equal(clean.attributes[ATTRIBUTE], undefined);
  assert.equal(clean.innerBlocks[0].attributes[ATTRIBUTE], undefined);
  assert.equal(clean.innerBlocks[0].attributes.content, 'Price');
  assert.deepEqual(clean.innerBlocks[0].attributes.style, child.attributes.style);
  assert.ok(child.attributes[ATTRIBUTE]);
  assert.equal(canContain(parent), true);
  assert.equal(canContain(block('generic', { layout: { type: 'constrained' } }, 'core/group')), false);
  assert.equal(canContain(block('canvas', {}, 'tabor/canvas')), false);
});

test('ungrouping native flow content grows the canvas and preserves button minimums', () => {
  const saved = rectanglePlacement({ left: 110, top: 900, width: 20, height: 20 }, 'mobile', geometry.mobile, 3, { columnSpan: 4, rowSpan: 2 });
  assert.ok(saved.row > 12);
  const mapped = mapCanvasPlacement(saved, 'mobile', geometry.mobile, { columnSpan: 4, rowSpan: 2 });
  assert.ok(mapped.columnSpan >= 4);
  assert.ok(mapped.rowSpan >= 2);
  const released = releasedLayout(saved, 'mobile');
  assert.deepEqual(Object.keys(released), ['layers', 'desktop', 'mobile']);
  assert.equal(released.desktop.gridColumns, 24);
  assert.equal(released.mobile.gridColumns, 12);
  assert.equal(JSON.stringify(released).includes('_rect'), false);
});
