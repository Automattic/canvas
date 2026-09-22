import { assertNearestRowCenter } from './helpers/snapped-placement.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertHorizontalSnap } from './helpers/snapped-placement.mjs';
import { canvasColumns, canvasRows, dragMovePlacement, mapCanvasPlacement, nudgeCanvasPlacement, occupiedRows, savedCanvasPlacement, snapCanvasPlacement, transformCanvasPlacement } from '../src/canvas-geometry.mjs';
import { MAX_ROWS, ROW_HEIGHT, minimumSpans, normalizePlacement } from '../src/placement.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const geometry = (mode, wideInset = 60) => {
  const width = { desktop: 1200, tablet: 800, mobile: 390 }[mode];
  return { ...canvasColumns(width, { top: 37, bottom: 61, left: 29, right: 53 }, wideInset, width - wideInset, 12, mode, undefined, { left: wideInset, right: wideInset }), ...canvasRows(37, 61, 20, 12), gap: 12 };
};
const placement = (mode, spans, rotation = 0, wideInset = 60) => mapCanvasPlacement(normalizePlacement({ column: 3, columnSpan: 5, row: 4, rowSpan: 4, rotation }, mode, {}, spans), mode, geometry(mode, wideInset), spans);
function assertCells(value) {
  const g = value._canvas, r = value._rect;
  assertHorizontalSnap(value);
  for (const [tracks, side, coordinate] of [[g.rows, 'start', r.top], [g.rows, 'end', r.top + r.height]]) {
    assert.ok(tracks.some(track => Math.abs(track[side] - coordinate) < 1e-7));
  }
  assert.equal(savedCanvasPlacement(value).free?.anchorY, undefined);
}

test('pixel movement preserves spans and rotation under default and button minimums', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const spans of [minimumSpans('core/paragraph'), minimumSpans('core/buttons')]) for (const rotation of [0, 35, -90]) {
    const start = placement(mode, spans, rotation);
    for (const [dx, dy] of [[7, 9], [8, 10], [-7, -9], [0, 9], [7, 0]]) {
      const preview = dragMovePlacement(start, mode, dx, dy, spans);
      close(preview._rect.left, start._rect.left + dx);
      close(preview._rect.top, start._rect.top + dy);
      close(preview._rect.width, start._rect.width);
      close(preview._rect.height, start._rect.height);
      assert.equal(preview.rotation, start.rotation);
      const saved = snapCanvasPlacement(preview, mode, spans, start);
      assertCells(saved);
      assert.equal(saved.columnSpan, start.columnSpan);
      assert.equal(saved.rowSpan, start.rowSpan);
      assert.equal(saved.rotation, start.rotation);
      assert.deepEqual(mapCanvasPlacement(JSON.parse(JSON.stringify(savedCanvasPlacement(saved))), mode, geometry(mode), spans)._rect, saved._rect);
    }
  }
});

test('moves stop at canvas boundaries and grow rows below the canvas', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    const spans = minimumSpans('core/buttons'), start = placement(mode, spans);
    for (const delta of [-50000, 50000]) {
      const preview = dragMovePlacement(start, mode, delta, delta, spans), g = preview._canvas, r = preview._rect;
      close(r.width, start._rect.width); close(r.height, start._rect.height);
      assert.ok(r.left >= 0 && r.top >= 0 && r.left + r.width <= g.width + 1e-7);
      assert.ok(r.top + r.height <= g.padding.top + MAX_ROWS * (ROW_HEIGHT + g.gap) - g.gap + 1e-7);
      if (delta > 0) assert.equal(g.coreRows, MAX_ROWS);
      const snapped = snapCanvasPlacement(preview, mode, spans, start);
      assertCells(snapped);
      assert.equal(snapped.columnSpan, start.columnSpan);
      assert.equal(snapped.rowSpan, start.rowSpan);
      const canvas = { ...geometry(mode), ...canvasRows(g.padding.top, g.padding.bottom, Math.max(20, occupiedRows(snapped)), g.gap) };
      assert.deepEqual(mapCanvasPlacement(savedCanvasPlacement(snapped), mode, canvas, spans)._rect, snapped._rect);
    }
  }
});

test('a second finger can turn a smooth move into a resize without retaining the old span', () => {
  const spans = minimumSpans('core/image'), start = placement('desktop', spans);
  const moved = dragMovePlacement(start, 'desktop', 13, 17, spans);
  const origin = [{ x: 250, y: 200 }, { x: 350, y: 200 }];
  const enlarged = transformCanvasPlacement(moved, 'desktop', origin, [{ x: 235, y: 200 }, { x: 375, y: 200 }], spans);
  const saved = snapCanvasPlacement(enlarged, 'desktop', spans);
  assertCells(saved);
  assert.ok(saved.columnSpan > start.columnSpan);
  assert.ok(saved.rowSpan > start.rowSpan);
});

test('keyboard movement still nudges a snapped placement by one cell', () => {
  const spans = minimumSpans('core/paragraph'), start = placement('desktop', spans);
  const saved = snapCanvasPlacement(dragMovePlacement(start, 'desktop', 17, 19, spans), 'desktop', spans, start);
  const right = nudgeCanvasPlacement(saved, 'desktop', 1, 0, spans);
  const down = nudgeCanvasPlacement(saved, 'desktop', 0, 1, spans);
  assert.equal(right.column, saved.column + 1); assert.equal(right.row, saved.row);
  assert.equal(down.row, saved.row + 1); assert.equal(down.column, saved.column);
  for (const value of [right, down]) {
    assertCells(value);
    assert.equal(value.columnSpan, saved.columnSpan); assert.equal(value.rowSpan, saved.rowSpan);
  }
});

test('pointer moves land on wide guides at cell boundaries and retain the anchor after saving', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const spans of [minimumSpans('core/paragraph'), minimumSpans('core/buttons')]) {
    const start = placement(mode, spans, 0, 96), g = start._canvas;
    for (const side of ['left', 'right']) {
      const anchor = side === 'left' ? 'left' : 'right';
      const target = side === 'left' ? g.wideStart : g.wideEnd;
      const edge = rect => rect.left + (side === 'right' ? rect.width : 0);
      for (const distance of [-5, 0, 5]) {
        const preview = dragMovePlacement(start, mode, target + distance - edge(start._rect), 36, spans);
        const dropped = snapCanvasPlacement(preview, mode, spans, start);
        close(edge(dropped._rect), target);
        assert.equal(dropped.columnSpan, start.columnSpan);
        assert.equal(dropped.rowSpan, start.rowSpan);
        const saved = JSON.parse(JSON.stringify(savedCanvasPlacement(dropped)));
        const reopened = mapCanvasPlacement(saved, mode, g, spans);
        assert.deepEqual(reopened._rect, dropped._rect);
        assert.deepEqual(snapCanvasPlacement(reopened, mode, spans)._rect, reopened._rect);
        const vertical = snapCanvasPlacement(dragMovePlacement(reopened, mode, 0, 36, spans), mode, spans, reopened);
        close(edge(vertical._rect), target);
      }
    }
  }
});

test('wide-guide snapping uses the same screen-pixel tolerance as highlighting', () => {
  const spans = minimumSpans('core/paragraph'), start = placement('desktop', spans);
  const preview = dragMovePlacement(start, 'desktop', start._canvas.wideStart + 10 - start._rect.left, 0, spans);
  assert.notEqual(snapCanvasPlacement(preview, 'desktop', spans, start)._base.anchors?.left, 'wide');
  const zoomed = snapCanvasPlacement(preview, 'desktop', spans, start, 12);
  assert.equal(zoomed._base.anchors?.left, 'wide');
  close(zoomed._rect.left, start._canvas.wideStart);
});

test('vertical centering saves the nearest cell position and unchanged span', () => {
  const minimum = { columnSpan: 1, rowSpan: 1 };
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const count of [19, 20]) for (const rowSpan of [3, 4]) {
    const g = { ...geometry(mode), padding: { ...geometry(mode).padding, top: 24, bottom: 24 }, ...canvasRows(24, 24, count, 12) };
    const start = mapCanvasPlacement(normalizePlacement({ column: 3, columnSpan: 3, row: 2, rowSpan }, mode, {}, minimum), mode, g, minimum);
    const dy = g.height / 2 - start._rect.top - start._rect.height / 2;
    for (const offset of [-5, 0, 5]) {
      const preview = dragMovePlacement(start, mode, 0, dy + offset, minimum);
      const snapped = snapCanvasPlacement(preview, mode, minimum, start);
      assertNearestRowCenter(snapped);
      close(snapped._rect.width,start._rect.width);
      close(snapped._rect.height,start._rect.height);
      assert.deepEqual(mapCanvasPlacement(savedCanvasPlacement(snapped), mode, g, minimum)._rect, snapped._rect);
    }
  }
});
