import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasRows } from '../src/canvas-geometry.mjs';
import { measureBox } from '../src/automatic-content.mjs';

test('long fractional row tracks retain their cumulative geometry across browser precisions', () => {
  for (const [top, bottom, count, gap, height] of [[32, 32, 1600, 4.902, 7.353], [0, 0, 2500, 0, 7.353], [17.3, 9.7, 900, 2.431, 5.621]]) {
    const grid = canvasRows(top, bottom, count, gap, height);
    const lengths = grid.rowTemplate.split(' ').map(parseFloat);
    for (const precision of [60, 64]) {
      const rendered = lengths.reduce((sum, length) => sum + Math.floor(length * precision) / precision, 0);
      assert.ok(Math.abs(rendered - grid.height) <= 0.125001, `${precision}: ${rendered} vs ${grid.height}`);
    }
    let edge = 0;
    for (const [index, length] of lengths.entries()) {
      edge += length;
      const row = grid.rows[Math.ceil(index / 2)];
      const expected = index % 2 ? row.start : row.end;
      assert.ok(Math.abs(edge - expected) <= 0.125001);
    }
  }
});

function element(height) {
  const clone = {
    removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [],
    classList: { add() {} }, style: { setProperty() {} }, remove() {},
    ownerDocument: { defaultView: { getComputedStyle: () => ({ height: `${height}px`, width: '300px', boxSizing: 'border-box' }) } },
    offsetHeight: Math.floor(height), scrollHeight: Math.floor(height),
  };
  return { cloneNode: () => clone, parentElement: { append() {} } };
}

test('native metadata keeps its intrinsic height without a button-sized minimum', () => {
  assert.equal(measureBox(element(22.4), '300px').height, 23);
  assert.equal(measureBox(element(0), '300px').height, 0);
  assert.equal(measureBox(element(90.4), '300px').height, 91);
});

test('button compositions retain the existing readable control minimum', () => {
  assert.equal(measureBox(element(22.4), '300px', true).height, 48);
  assert.equal(measureBox(element(90.4), '300px', true).height, 91);
});
