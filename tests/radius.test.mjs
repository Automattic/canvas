import test from 'node:test';
import assert from 'node:assert/strict';
import { radiusQuantity, radiusCorner, radiusIsMixed, radiusModel, radiusAtDelta, radiusDragDelta, radiusKeyDelta, radiusUpdates, radiusHandlePosition, radiusEditableUnit } from '../src/radius.mjs';
import { readRadiusTargets } from '../src/radius-targets.mjs';

const box = { width: 200, height: 80 };

test('native radius quantities retain units and expressions require computed values', () => {
  assert.deepEqual(radiusQuantity(0), { value: 0, unit: 'px' });
  assert.deepEqual(radiusQuantity('.75rem'), { value: .75, unit: 'rem' });
  assert.deepEqual(radiusQuantity('12%'), { value: 12, unit: '%' });
  for (const value of [undefined, -1, 'var(--radius)', 'var:preset|border-radius|small', 'calc(1rem + 2px)', '12px 24px']) assert.equal(radiusQuantity(value), null);
  const preset = radiusModel('var:preset|border-radius|small', '16px', box);
  assert.equal(radiusAtDelta(preset, 4), '20px');
});

test('drag values preserve pixels, relative font units, percentages, and viewport units', () => {
  for (const [raw, computed, pixelsPerUnit, delta, expected] of [
    ['12px', '12px', 1, 4, '16px'],
    ['.75rem', '12px', 16, 4, '1rem'],
    ['1em', '20px', 20, 5, '1.25em'],
    ['10%', '10%', 1, 10, '15%'],
    ['1vw', '10px', 10, 5, '1.5vw'],
    ['0rem', '0px', 16, 8, '0.5rem'],
  ]) assert.equal(radiusAtDelta(radiusModel(raw, computed, { ...box, pixelsPerUnit, step: raw.endsWith('px') ? 1 : .01 }), delta), expected);
});

test('pill defaults respond immediately and values clamp to visible limits', () => {
  const pill = radiusModel(undefined, '9999px', box);
  assert.equal(pill.value, 40);
  assert.equal(radiusAtDelta(pill, -1), '39px');
  assert.equal(radiusAtDelta(pill, 100), '40px');
  assert.equal(radiusAtDelta(pill, -500), '0px');
  const percent = radiusModel('100%', '100%', box);
  assert.equal(percent.maximum, 50);
  assert.equal(radiusAtDelta(percent, -2), '49%');
});

test('unequal corners are read without mutation and use the logical end corner', () => {
  const corners = { topLeft: '1rem', topRight: '12px', bottomLeft: '25%', bottomRight: '6px' };
  const original = JSON.stringify(corners);
  assert.equal(radiusCorner(corners), '12px');
  assert.equal(radiusCorner(corners, true), '1rem');
  assert.equal(radiusIsMixed(corners), true);
  assert.equal(radiusModel(corners, '12px', box).label, 'Mixed');
  assert.equal(radiusAtDelta(radiusModel(corners, '12px', box), 4), '16px');
  assert.equal(JSON.stringify(corners), original);
});

test('drag direction mirrors in RTL and projects into rotated local axes', () => {
  assert.equal(radiusDragDelta(-10, 0), 10);
  assert.equal(radiusDragDelta(10, 0, 0, true), 10);
  assert.ok(Math.abs(radiusDragDelta(0, -10, 90) - 10) < 1e-10);
  assert.ok(Math.abs(radiusDragDelta(0, 10, 90, true) - 10) < 1e-10);
  assert.equal(radiusKeyDelta('ArrowLeft'), 1);
  assert.equal(radiusKeyDelta('ArrowRight', true), 1);
  assert.equal(radiusKeyDelta('ArrowDown', true), -1);
});

test('multiple buttons preserve their units and unrelated native styles', () => {
  const attributes = {
    a: { style: { border: { width: '2px', color: '#000', radius: '12px' }, color: { background: '#fff' } }, text: 'A' },
    b: { style: { border: { radius: '1rem' }, typography: { fontSize: '18px' } }, text: 'B' },
  };
  const original = JSON.stringify(attributes);
  const targets = ['a', 'b'].map(id => ({ id }));
  const values = [radiusAtDelta(radiusModel('12px', '12px', box), 4), radiusAtDelta(radiusModel('1rem', '16px', { ...box, pixelsPerUnit: 16, step: .01 }), 4)];
  const updates = radiusUpdates(targets, values, id => attributes[id]);
  assert.equal(updates.a.style.border.radius, '16px');
  assert.equal(updates.b.style.border.radius, '1.25rem');
  assert.equal(updates.a.style.border.width, '2px');
  assert.deepEqual(updates.a.style.color, attributes.a.style.color);
  assert.deepEqual(updates.b.style.typography, attributes.b.style.typography);
  assert.equal(JSON.stringify(attributes), original);
  assert.equal(Object.keys(updates).length, 2);
  assert.deepEqual(radiusUpdates([{ id: 'missing' }], ['0px'], () => undefined), {});
});

test('dragging snaps to Inspector increments instead of pointer precision', () => {
  assert.equal(radiusAtDelta(radiusModel('40px', '40px', { width: 200, height: 200 }), 1.12), '41px');
  assert.equal(radiusAtDelta(radiusModel('1rem', '16px', { ...box, pixelsPerUnit: 16, step: .01 }), 7.123), '1.45rem');
  assert.equal(radiusAtDelta(radiusModel('10%', '10%', { ...box, step: .1 }), 1.123), '10.6%');
  const oddPill = radiusModel(undefined, '9999px', { width: 121, height: 81 });
  assert.equal(radiusAtDelta(oddPill, 100), '41px');
  assert.equal(radiusAtDelta(oddPill, -1), '40px');
  assert.equal(radiusAtDelta(oddPill, -100), '0px');
});

test('resolved block settings control eligibility and editable units', () => {
  const px = { value: 'px', step: 1 };
  const rem = { value: 'rem', step: .01 };
  assert.equal(radiusEditableUnit('12px', '12px', { enabled: false, units: [px] }), null);
  assert.equal(radiusEditableUnit('12px', '12px', undefined), null);
  assert.equal(radiusEditableUnit('12px', '12px', { enabled: true, units: [] }), null);
  assert.deepEqual(radiusEditableUnit('1rem', '16px', { enabled: true, units: [px, rem] }), rem);
  assert.deepEqual(radiusEditableUnit('1rem', '16px', { enabled: true, units: [px] }), px);
  assert.deepEqual(radiusEditableUnit('var:preset|border-radius|small', '16px', { enabled: true, units: [rem] }), rem);
  const model = radiusModel('16px', '16px', { ...box, unit: 'rem', step: .01, pixelsPerUnit: 16 });
  assert.equal(radiusAtDelta(model, 4), '1.25rem');
});

test('Buttons cannot bypass disabled radius settings on any direct child', () => {
  const element = { offsetWidth: 200, offsetHeight: 80, ownerDocument: { defaultView: { getComputedStyle: () => ({ borderTopRightRadius: '12px' }) } } };
  const grid = { ownerDocument: { getElementById: () => ({ querySelector: () => element }) }, contains: () => true };
  const block = { name: 'core/buttons', innerBlocks: ['a', 'b'].map(clientId => ({ clientId, name: 'core/button', attributes: {} })) };
  const store = { getBlockEditingMode: () => 'default' };
  const enabled = { enabled: true, units: [{ value: 'px', step: 1 }] };
  const settings = new Map([['a', enabled], ['b', { ...enabled, enabled: false }]]);
  assert.deepEqual(readRadiusTargets(block, grid, store, false, settings), []);
  settings.set('b', enabled);
  assert.equal(readRadiusTargets(block, grid, store, false, settings).length, 2);
});

test('handle hit areas clear all resize handles on small blocks, touch, and zoom', () => {
  for (const [width, height] of [[200, 80], [32, 24], [200, 200], [80, 500], [500, 200]]) {
    for (const touch of [false, true]) for (const scale of [1, .5]) for (const rtl of [false, true]) for (const pixels of [0, 12, 1000]) {
      const position = radiusHandlePosition(width, height, pixels, rtl, touch, scale);
      const minimum = (touch ? 44 : 18) / scale;
      const handles = [[0, 0], [width / 2, 0], [width, 0], [width, height / 2], [width, height], [width / 2, height], [0, height], [0, height / 2]];
      assert.ok(handles.every(([x, y]) => Math.hypot(x - position.left, y - position.top) >= minimum), JSON.stringify({ width, height, touch, scale, rtl, position }));
      const opposite = radiusHandlePosition(width, height, pixels, !rtl, touch, scale);
      assert.equal(position.left + opposite.left, width);
    }
  }
});

test('short blocks at the canvas edge keep the radius target inside its width', () => {
  for (const rtl of [false, true]) {
    const position = radiusHandlePosition(320, 60, 12, rtl, true, 1, 0);
    assert.equal(position.left, 160);
    assert.equal(position.top, 108);
  }
});
