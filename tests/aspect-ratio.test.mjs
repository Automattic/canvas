import test from 'node:test';
import assert from 'node:assert/strict';
import { assertHorizontalSnap } from './helpers/snapped-placement.mjs';
import { resizeAspectRect, normalizeFreeFrame, freeFrameStyles } from '../src/aspect-ratio.mjs';
import { canvasColumns, canvasRows, dragAspectRatioPlacement, mapCanvasPlacement, savedCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { ATTRIBUTE, resolveLayouts, savePlacement, normalizePlacement } from '../src/geometry.mjs';

const rect = { left: 200, top: 200, width: 300, height: 200 };
const bounds = { width: 1200, height: 18000 };
const minimum = { columnSpan: 1, rowSpan: 1 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const geometry = (width = 1200, gap = 12, mode = 'desktop') => ({
  ...canvasColumns(width, { top: 37, bottom: 61, left: 29, right: 53 }, 100, width - 100, gap, mode),
  ...canvasRows(37, 61, 12, gap), gap,
});
const initial = () => mapCanvasPlacement(normalizePlacement({ column: 5, row: 4, columnSpan: 7, rowSpan: 5 }), 'desktop', geometry());

function assertSnapped(placement) {
  const { _rect: box, _canvas: canvas } = placement;
  const onTrack = (list, edge, position) => assert.ok(list.some((track) => Math.abs(track[edge] - position) < 1e-7), `${position} is not a cell ${edge}`);
  assertHorizontalSnap(placement);
  onTrack(canvas.rows, 'start', box.top);
  onTrack(canvas.rows, 'end', box.top + box.height);
  assert.equal(savedCanvasPlacement(placement).free?.anchorY, undefined);
  if (!placement.free) assert.deepEqual(freeFrameStyles(placement), {});
}

function anchor(box, kind, rotation = 0) {
  const x = (kind.includes('w') ? .5 : kind.includes('e') ? -.5 : 0) * box.width;
  const y = (kind.includes('n') ? .5 : kind.includes('s') ? -.5 : 0) * box.height;
  const r = rotation * Math.PI / 180;
  return { x: box.left + box.width / 2 + x * Math.cos(r) - y * Math.sin(r), y: box.top + box.height / 2 + x * Math.sin(r) + y * Math.cos(r) };
}

test('all eight handles preserve the ratio and the opposite anchor, including rotated images', () => {
  for (const rotation of [0, 35, -90]) for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const next = resizeAspectRect(rect, kind, 37, 19, 1.5, bounds, rotation);
    close(next.width / next.height, 1.5);
    const before = anchor(rect, kind, rotation), after = anchor(next, kind, rotation);
    close(before.x, after.x); close(before.y, after.y);
  }
});

test('corner projection is continuous and side handles do not grow from an extra corner', () => {
  const a = resizeAspectRect(rect, 'se', 30, 19.99, 1.5, bounds);
  const b = resizeAspectRect(rect, 'se', 30, 20.01, 1.5, bounds);
  assert.ok(Math.abs(a.width - b.width) < .02);
  const side = resizeAspectRect(rect, 'e', 30, 0, 1.5, bounds);
  close(side.left, rect.left); close(side.top + side.height / 2, rect.top + rect.height / 2);
});

test('bounds and minimum sizes never break the ratio', () => {
  for (const kind of ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']) for (const delta of [-50000, 50000]) {
    const next = resizeAspectRect(rect, kind, delta, delta, 1.5, bounds);
    close(next.width / next.height, 1.5);
    assert.ok(next.width >= 24 && next.height >= 24);
    assert.ok(next.left >= -1e-7 && next.top >= -1e-7);
    assert.ok(next.left + next.width <= bounds.width + 1e-7);
    assert.ok(next.top + next.height <= bounds.height + 1e-7);
  }
});

test('sub-cell pointer changes resize the actual mapped rectangle without grid rounding', () => {
  const start = initial(), ratio = start._rect.width / start._rect.height;
  const a = dragAspectRatioPlacement(start, 'desktop', 'se', 10, 5, ratio, minimum);
  const b = dragAspectRatioPlacement(start, 'desktop', 'se', 11, 5, ratio, minimum);
  assert.ok(b._rect.width > a._rect.width && b._rect.width - a._rect.width < 1);
  close(a._rect.width / a._rect.height, ratio);
  close(b._rect.width / b._rect.height, ratio);
  close(parseFloat(freeFrameStyles(b)['--canvas-free-width']), b._rect.width);
});

test('release and reopening preserve snapped cells without saving the smooth preview', () => {
  const start = initial(), ratio = start._rect.width / start._rect.height;
  const next = dragAspectRatioPlacement(start, 'desktop', 'nw', -43, -37, ratio, minimum);
  const snapped = snapCanvasPlacement(next, 'desktop', minimum);
  assertSnapped(snapped);
  const saved = JSON.parse(JSON.stringify(savedCanvasPlacement(snapped)));
  const reopened = mapCanvasPlacement(normalizePlacement(saved), 'desktop', geometry());
  for (const key of ['left', 'top', 'width', 'height']) close(reopened._rect[key], snapped._rect[key]);
  for (const width of [600, 960, 1800]) {
    const resized = mapCanvasPlacement(normalizePlacement(saved), 'desktop', geometry(width));
    assertSnapped(resized);
  }
});

test('snapping retains the captured ratio and other viewport overrides', () => {
  const start = initial(), ratio = start._rect.width / start._rect.height;
  const saved = { aspectRatio: ratio, desktop: savedCanvasPlacement(start), mobile: { column: 1, row: 1, columnSpan: 4, rowSpan: 3 } };
  const image = { clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: saved } };
  const layouts = resolveLayouts([image]);
  const next = dragAspectRatioPlacement(start, 'desktop', 'se', 37, 18, ratio, minimum);
  const result = savePlacement(saved, layouts.image, 'desktop', snapCanvasPlacement(next, 'desktop'));
  close(result.aspectRatio, ratio);
  assert.deepEqual(result.mobile, saved.mobile);
  assert.equal(result.desktop.free, undefined);
});

test('all handles release onto logical cells across viewports, gaps and limits', () => {
  for (const [mode, width] of [['desktop', 1200], ['tablet', 800], ['mobile', 390]]) for (const gap of [0, 12, 27]) {
    const start = mapCanvasPlacement(normalizePlacement({ column: 2, columnSpan: 3, row: 4, rowSpan: 4 }, mode), mode, geometry(width, gap, mode));
    const ratio = start._rect.width / start._rect.height;
    for (const kind of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) for (const delta of [-1000, -43, 17, 5000]) {
      const preview = dragAspectRatioPlacement(start, mode, kind, delta, delta / 2, ratio, minimum);
      const snapped = snapCanvasPlacement(preview, mode);
      assertSnapped(snapped);
      const again = snapCanvasPlacement(snapped, mode);
      for (const key of ['left', 'top', 'width', 'height']) close(again._rect[key], snapped._rect[key]);
    }
  }
});

test('malformed precise frame metadata is ignored', () => {
  for (const free of [null, {}, { x: 0, y: 0, width: NaN, ratio: 1 }, { x: 0, y: 0, width: .5, ratio: 0 }]) assert.equal(normalizeFreeFrame(free), undefined);
});
