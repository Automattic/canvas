import test from 'node:test';
import assert from 'node:assert/strict';
import { assertHorizontalSnap } from './helpers/snapped-placement.mjs';
import { resizeAspectRect, resizeRect } from '../src/aspect-ratio.mjs';
import { centerResizeModifier, resizeGestureKind } from '../src/resize-modifiers.mjs';
import { canvasColumns, canvasRows, dragResizePlacement, mapCanvasPlacement, savedCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { normalizePlacement, minimumSpans } from '../src/placement.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const rect = { left: 200, top: 200, width: 300, height: 200 };
const bounds = { width: 1200, height: 18000 };
const minimum = { width: 40, height: 24 };
const geometry = (mode) => {
  const width = { desktop: 1200, tablet: 800, mobile: 390 }[mode];
  return { ...canvasColumns(width, { top: 37, bottom: 61, left: 29, right: 53 }, 60, width - 60, 12, mode), ...canvasRows(37, 61, 20, 12), gap: 12 };
};

function anchor(box, kind, rotation) {
  const x = (kind.includes('w') ? .5 : kind.includes('e') ? -.5 : 0) * box.width;
  const y = (kind.includes('n') ? .5 : kind.includes('s') ? -.5 : 0) * box.height;
  const angle = rotation * Math.PI / 180;
  return { x: box.left + box.width / 2 + x * Math.cos(angle) - y * Math.sin(angle), y: box.top + box.height / 2 + x * Math.sin(angle) + y * Math.cos(angle) };
}

test('unlocked resize follows each axis independently in pixel increments', () => {
  const edge = resizeRect(rect, 'e', 7, 53, bounds, minimum);
  close(edge.width, 307); close(edge.height, 200); close(edge.left, 200); close(edge.top, 200);
  const corner = resizeRect(rect, 'se', 8, 19, bounds, minimum);
  close(corner.width, 308); close(corner.height, 219);
  assert.notEqual(corner.width / corner.height, rect.width / rect.height);
});

test('all eight unlocked handles preserve the opposite anchor at any rotation', () => {
  for (const rotation of [0, 35, -90]) for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const next = resizeRect(rect, kind, 37, 19, bounds, minimum, rotation);
    const before = anchor(rect, kind, rotation), after = anchor(next, kind, rotation);
    close(before.x, after.x); close(before.y, after.y);
    if (!/[ew]/.test(kind)) close(next.width, rect.width);
    if (!/[ns]/.test(kind)) close(next.height, rect.height);
  }
});

test('unlocked sizing respects minimum dimensions and canvas boundaries', () => {
  for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) for (const delta of [-50000, 50000]) {
    const next = resizeRect(rect, kind, delta, delta, bounds, minimum);
    assert.ok(next.width >= minimum.width && next.height >= minimum.height);
    assert.ok(next.left >= 0 && next.top >= 0);
    assert.ok(next.left + next.width <= bounds.width);
    assert.ok(next.top + next.height <= bounds.height);
  }
});

test('resizing previews smoothly and snaps in each viewport under default and button minimums', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const spans of [minimumSpans('core/paragraph'), minimumSpans('core/buttons')]) {
    const canvas = geometry(mode);
    const start = mapCanvasPlacement(normalizePlacement({ column: 2, columnSpan: 5, row: 3, rowSpan: 5 }, mode, {}, spans), mode, canvas, spans);
    for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const x = kind.includes('w') ? -1 : 1, y = kind.includes('n') ? -1 : 1;
      const a = dragResizePlacement(start, mode, kind, 7 * x, 9 * y, spans);
      const b = dragResizePlacement(start, mode, kind, 8 * x, 10 * y, spans);
      assert.ok(Math.abs(a._rect.width - b._rect.width) > .1 || Math.abs(a._rect.height - b._rect.height) > .1, `${mode} ${spans.columnSpan}x${spans.rowSpan} ${kind} must preview below cell precision`);
      const snapped = snapCanvasPlacement(b, mode, spans), r = snapped._rect, g = snapped._canvas;
      assertHorizontalSnap(snapped);
      for (const [tracks, side, value] of [[g.rows, 'start', r.top], [g.rows, 'end', r.top + r.height]]) {
        assert.ok(tracks.some(t => Math.abs(t[side] - value) < 1e-7));
      }
      assert.ok(snapped.columnSpan >= spans.columnSpan && snapped.rowSpan >= spans.rowSpan);
      assert.equal(savedCanvasPlacement(snapped).free, undefined);
      const reopened = mapCanvasPlacement(JSON.parse(JSON.stringify(savedCanvasPlacement(snapped))), mode, canvas, spans);
      assert.deepEqual(reopened._rect, r);
    }
  }
});

test('the shared preview still applies the image ratio constraint when enabled', () => {
  const canvas = geometry('desktop'), spans = minimumSpans('core/image');
  const start = mapCanvasPlacement(normalizePlacement({ column: 4, columnSpan: 7, row: 3, rowSpan: 5 }), 'desktop', canvas, spans);
  const ratio = start._rect.width / start._rect.height;
  const locked = dragResizePlacement(start, 'desktop', 'se', 73, 7, spans, ratio);
  const unlocked = dragResizePlacement(start, 'desktop', 'se', 73, 7, spans);
  close(locked._rect.width / locked._rect.height, ratio);
  assert.notEqual(unlocked._rect.width / unlocked._rect.height, ratio);
});

test('Shift plus the platform modifier resizes handles while the modifier alone rotates corners', () => {
  for (const [platform, modifier, other] of [['MacIntel', 'metaKey', 'ctrlKey'], ['Win32', 'ctrlKey', 'metaKey'], ['Linux x86_64', 'ctrlKey', 'metaKey']]) {
    const event = { target: { ownerDocument: { defaultView: { navigator: { platform } } } }, pointerType: 'mouse', [modifier]: true };
    for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      assert.equal(resizeGestureKind(event, kind), kind.length === 2 ? 'rotate' : kind);
      assert.equal(resizeGestureKind({ ...event, shiftKey: true }, kind), kind);
    }
    assert.equal(centerResizeModifier({ ...event, shiftKey: true }), true);
    assert.equal(centerResizeModifier(event), false);
    assert.equal(centerResizeModifier({ ...event, shiftKey: true, [modifier]: false, [other]: true }), false);
    assert.equal(centerResizeModifier({ ...event, shiftKey: true, pointerType: 'touch' }), false);
    assert.equal(resizeGestureKind({ ...event, pointerType: 'touch' }, 'se'), 'se');
  }
});

test('centered proportional resizing moves all four sides equally around a fixed center', () => {
  for (const rotation of [0, 35, -90]) for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const dx = kind.includes('w') ? -30 : 30, dy = kind.includes('n') ? -20 : 20;
    for (const direction of [-1, 1]) {
      const next = resizeAspectRect(rect, kind, direction * dx, direction * dy, 1.5, bounds, rotation, true);
      close(next.width, rect.width + direction * 60);
      close(next.height, rect.height + direction * 40);
      close(next.left + next.width / 2, rect.left + rect.width / 2);
      close(next.top + next.height / 2, rect.top + rect.height / 2);
      close(next.width / next.height, 1.5);
    }
  }
});

test('centered resizing stops at boundaries and minimum size without drifting or flipping', () => {
  for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) for (const delta of [-50000, 50000]) {
    const next = resizeAspectRect(rect, kind, delta, delta, 1.5, bounds, 35, true);
    assert.ok(next.width >= 24 && next.height >= 24);
    assert.ok(next.left >= 0 && next.top >= 0);
    assert.ok(next.left + next.width <= bounds.width && next.top + next.height <= bounds.height);
    close(next.left + next.width / 2, rect.left + rect.width / 2);
    close(next.top + next.height / 2, rect.top + rect.height / 2);
    close(next.width / next.height, 1.5);
  }
});

test('centered resize previews preserve proportions and settle to symmetric saved cells in every viewport', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const name of ['core/paragraph', 'core/buttons', 'core/image']) {
    const canvas = geometry(mode), spans = minimumSpans(name);
    const start = mapCanvasPlacement(normalizePlacement({ column: 3, columnSpan: 3, row: 7, rowSpan: 5 }, mode, {}, spans), mode, canvas, spans);
    for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const dx = start._rect.width * (kind.includes('w') ? -.4 : .4), dy = start._rect.height * (kind.includes('n') ? -.4 : .4);
      const preview = dragResizePlacement(start, mode, kind, dx, dy, spans, undefined, true);
      close(preview._rect.width / preview._rect.height, start._rect.width / start._rect.height);
      close(preview._rect.left + preview._rect.width / 2, start._rect.left + start._rect.width / 2);
      close(preview._rect.top + preview._rect.height / 2, start._rect.top + start._rect.height / 2);
      const snapped = snapCanvasPlacement(preview, mode, spans, undefined, 6, start._rect);
      close(snapped._rect.left + snapped._rect.width / 2, start._rect.left + start._rect.width / 2);
      close(snapped._rect.top + snapped._rect.height / 2, start._rect.top + start._rect.height / 2);
      assert.ok(snapped._rect.width > start._rect.width);
      assertHorizontalSnap(snapped);
      const saved = savedCanvasPlacement(snapped);
      assert.equal(saved.free, undefined);
      assert.ok(Object.keys(saved).every(key => !key.startsWith('_')));
      assert.deepEqual(mapCanvasPlacement(JSON.parse(JSON.stringify(saved)), mode, canvas, spans)._rect, snapped._rect);
    }
  }
});
