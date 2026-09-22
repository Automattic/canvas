import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE, rowHeightForWidth, rowPitch, resolveLayouts } from '../src/geometry.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement, savedCanvasPlacement, dragResizePlacement, resizeCanvasWithKey } from '../src/canvas-geometry.mjs';
import { imageResizeRatio } from '../src/image-shapes.mjs';
import { resolveAutomaticContent } from '../src/automatic-content.mjs';
import { withInsertionDefaults } from '../src/insertion-defaults.mjs';

const padding = { top: 0, right: 0, bottom: 0, left: 0 };
const minimum = { columnSpan: 1, rowSpan: 1 };
const geometry = (width, viewport = 'desktop', gap = 12) => ({
  ...canvasColumns(width, padding, 0, width, gap, viewport),
  ...canvasRows(0, 0, 12, gap, rowHeightForWidth(width, viewport)),
  gap, viewport, referenceWidth: 1440, referenceRowHeight: rowHeightForWidth(1440, viewport),
});
const block = { clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: {
  desktop: { column: 2, columnSpan: 8, row: 2, rowSpan: 8 },
} } };
const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);

test('desktop rows scale with the grid while smaller viewports retain their own row size', () => {
  const frames = [900, 1800].map(width => resolveLayouts([block], { desktop: geometry(width, 'desktop', 0) }).image.desktop._rect);
  close(frames[1].width, frames[0].width * 2);
  close(frames[1].height, frames[0].height * 2);
  for (const mode of ['tablet', 'mobile']) for (const width of [320, 390, 768]) assert.equal(geometry(width, mode).rowHeight, 24);
});

test('manual viewport frames and rendering are independent of the resize lock', () => {
  const saved = { ...block.attributes[ATTRIBUTE], mobile: { gridColumns: 8, column: 1, columnSpan: 6, row: 1, rowSpan: 3 } };
  const measured = { desktop: geometry(1800), mobile: geometry(390, 'mobile') };
  const plain = resolveLayouts([{ ...block, attributes: { [ATTRIBUTE]: saved } }], measured).image;
  const locked = resolveLayouts([{ ...block, attributes: { [ATTRIBUTE]: { ...saved, aspectRatio: 4 } } }], measured).image;
  assert.deepEqual(locked.mobile._rect, plain.mobile._rect);
  assert.deepEqual(locked.desktop._rect, plain.desktop._rect);
  const start = locked.mobile;
  const ratio = imageResizeRatio(locked, start);
  close(ratio, start._rect.width / start._rect.height);
  assert.notEqual(ratio, 4);
  const next = dragResizePlacement(start, 'mobile', 'e', 12, 0, minimum, ratio);
  close(next._rect.width / next._rect.height, ratio);
  assert.equal(imageResizeRatio(plain, start), undefined);
  assert.equal(imageResizeRatio({ shape: 'circle' }, start), undefined);
});

test('growing the canvas and reopening a keyboard resize retain the measured row pitch', () => {
  for (const width of [900, 1800]) {
    const g = geometry(width);
    const start = mapCanvasPlacement({ column: 2, columnSpan: 5, row: 11, rowSpan: 2 }, 'desktop', g);
    const next = resizeCanvasWithKey(start, 'desktop', 0, 1, minimum);
    close(next._rect.height - start._rect.height, rowPitch(g));
    assert.equal(next._canvas.rowHeight, g.rowHeight);
    assert.deepEqual(mapCanvasPlacement(savedCanvasPlacement(next), 'desktop', g)._rect, next._rect);
  }
});

test('automatic mobile image sizing uses the same reference frame at every source measurement width', () => {
  const element = { matches: () => false, querySelector: () => null,
    classList: { contains: name => name === 'canvas__image' },
    getAttribute: name => name === 'data-canvas-auto' ? 'tablet mobile' : null };
  const target = geometry(390, 'mobile');
  const results = [390, 1440, 2560].map(width => {
    const layouts = resolveLayouts([block], { desktop: geometry(width), mobile: target }).image;
    assert.deepEqual(resolveAutomaticContent([element], 'mobile', target, [layouts.mobile], [layouts.desktop]), {});
    return layouts.mobile._rect;
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  assert.ok(results[0].height > 1);
});

test('images inserted on mobile use reference desktop rows as well as reference columns', () => {
  const mobile = geometry(390, 'mobile');
  const incoming = { clientId: 'new', name: 'core/image', attributes: {} };
  const initialized = withInsertionDefaults(incoming, 'mobile', { ...mobile, geometry: { mobile, desktop: geometry(390) } });
  const desktop = resolveLayouts([initialized], { desktop: geometry(1440) }).new.desktop._rect;
  assert.ok(Math.abs(desktop.width - desktop.height) <= rowPitch(geometry(1440)) / 2);
});
