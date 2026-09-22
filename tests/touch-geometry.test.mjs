import { compactCanvas, serializePlacement } from '../src/serialization.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { transformTouchRect, nearestTouchHandle } from '../src/touch-geometry.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement, transformCanvasPlacement, snapCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { normalizePlacement, resolveLayouts, savePlacement, minimumSpans } from '../src/geometry.mjs';

const rect = { left: 100, top: 100, width: 200, height: 100 };
const bounds = { width: 1200, height: 1200 };
const pair = (x, y, distance, degrees = 0) => {
  const dx = distance / 2 * Math.cos(degrees * Math.PI / 180), dy = distance / 2 * Math.sin(degrees * Math.PI / 180);
  return [{ x: x - dx, y: y - dy }, { x: x + dx, y: y + dy }];
};
const close = (a, b) => assert.ok(Math.abs(a - b) < .01, `${a} != ${b}`);

test('pinch, twist and translation share a stable grabbed pivot', () => {
  const origin = pair(150, 150, 100);
  const result = transformTouchRect(rect, 20, origin, pair(250, 250, 200, 90), bounds);
  assert.equal(result.rotation, 110);
  close(result.rect.width, 400);
  close(result.rect.height, 200);
  close(result.rect.left, 50);
  close(result.rect.top, 250);
});

test('centered twists preserve dimensions and handle the angle boundary', () => {
  const result = transformTouchRect(rect, 20, pair(200, 150, 100, 179), pair(200, 150, 100, -179), bounds);
  assert.equal(result.rotation, 22);
  for (const key of Object.keys(rect)) close(result.rect[key], rect[key]);
});

test('scale limits preserve ratio, and invalid or coincident origins do not jump', () => {
  const origin = pair(200, 150, 100);
  for (const distance of [0, 10000]) {
    const result = transformTouchRect(rect, 0, origin, pair(-50, -50, distance), bounds);
    close(result.rect.width / result.rect.height, 2);
    assert.ok(result.rect.width >= 48 && result.rect.width <= bounds.width);
    assert.ok(result.rect.left >= 0 && result.rect.top >= 0);
    assert.ok(result.rect.left + result.rect.width <= bounds.width);
  }
  assert.deepEqual(transformTouchRect(rect, 0, pair(200, 150, 0), origin, bounds).rect, rect);
});

const geometry = mode => ({
  ...canvasColumns(mode === 'mobile' ? 390 : 1200, { top: 24, right: 24, bottom: 24, left: 24 }, 24, mode === 'mobile' ? 366 : 1176, 12, mode),
  ...canvasRows(24, 24, 12, 12), gap: 12,
});

test('transforms grow rows, snap on release and save only the active responsive override', () => {
  const desktop = normalizePlacement({ column: 3, columnSpan: 6, row: 2, rowSpan: 3, rotation: 10 });
  const saved = { desktop, fitArea: true, aspectRatio: 1.5 };
  const block = { clientId: 'a', name: 'core/image', attributes: { canvas: saved } };
  const layout = resolveLayouts([block], { desktop: geometry('desktop'), mobile: geometry('mobile') }).a;
  const start = layout.mobile;
  const center = { x: start._rect.left + start._rect.width / 2, y: start._rect.top + start._rect.height / 2 };
  const transformed = transformCanvasPlacement(start, 'mobile', pair(center.x, center.y, 80), pair(center.x, 800, 120, 30), minimumSpans('core/image'));
  assert.ok(transformed._canvas.coreRows > start._canvas.coreRows);
  assert.equal(transformed.rotation, 40);
  const snapped = snapCanvasPlacement(transformed, 'mobile', minimumSpans('core/image'));
  const result = savePlacement(saved, layout, 'mobile', snapped);
  assert.deepEqual(result.desktop, serializePlacement(desktop, 'desktop'));
  assert.equal(result.mobile.rotation, 40);
  assert.equal(result.fitArea, true);
  assert.equal(result.aspectRatio, 1.5);
  assert.equal(result.mobile.free, undefined);
  assert.ok(Object.keys(result.mobile).every(key => !key.startsWith('_')));
  const reopened = resolveLayouts([{ ...block, attributes: { canvas: JSON.parse(JSON.stringify(result)) } }], { mobile: transformed._canvas }).a;
  assert.equal(reopened.mobile.rotation, 40);
});

test('rotation-only transforms retain exact anchors instead of resnapping', () => {
  const g = geometry('mobile');
  const start = mapCanvasPlacement(normalizePlacement({ column: 2, columnSpan: 4, row: 3, rowSpan: 3 }, 'mobile'), 'mobile', g);
  const { left, top, width, height } = start._rect;
  const origin = pair(left + width / 2, top + height / 2, 80);
  const result = transformCanvasPlacement(start, 'mobile', origin, pair(left + width / 2, top + height / 2, 80, 45), { columnSpan: 1, rowSpan: 1 });
  assert.equal(result.rotation, 45);
  assert.deepEqual(savedCanvasPlacement(result), savedCanvasPlacement(start));
  assert.deepEqual(result._rect, start._rect);
});

test('overlapping touch handles choose the nearest center', () => {
  const handles = [{ kind: 'nw', x: 10, y: 10 }, { kind: 'n', x: 30, y: 10 }, { kind: 'ne', x: 50, y: 10 }];
  assert.equal(nearestTouchHandle({ x: 26, y: 18 }, handles), 'n');
  assert.equal(nearestTouchHandle({ x: 46, y: 12 }, handles), 'ne');
});

test('small block interiors remain draggable while their visible handles still resize', () => {
  const handles = [{ kind: 'n', x: 30, y: 0 }, { kind: 'e', x: 60, y: 12 }, { kind: 's', x: 30, y: 24 }, { kind: 'w', x: 0, y: 12 }];
  assert.equal(nearestTouchHandle({ x: 30, y: 12 }, handles), 'move');
  assert.equal(nearestTouchHandle({ x: 30, y: 2 }, handles), 'n');
  const rotate = ({ x, y, ...rest }) => ({ ...rest, x: -y, y: x });
  assert.equal(nearestTouchHandle(rotate({ x: 30, y: 12 }), handles.map(rotate)), 'move');
});
