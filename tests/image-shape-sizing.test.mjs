import { imageShapeUpdates } from '../src/image-shape-layout.mjs';
import { compactCanvas, serializePlacement } from '../src/serialization.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_SHAPES, preferredShapeRatio, imageResizeRatio, shapeInsets } from '../src/image-shapes.mjs';
import { canvasColumns, canvasRows, dragResizePlacement, fitCanvasPlacementToRatio, mapCanvasPlacement, resizeCanvasWithKey, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { ATTRIBUTE, COLUMNS, MAX_ROWS, normalizePlacement, resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { resolveCanvasLayouts, sourcePlacement } from '../src/canvas-groups.mjs';

const minimum = { columnSpan: 1, rowSpan: 1 };
const padding = { top: 24, right: 24, bottom: 24, left: 24 };
function geometry(mode, rows = 30) {
  const width = { desktop: 1200, tablet: 800, mobile: 390 }[mode];
  return { ...canvasColumns(width, padding, 24, width - 24, 12, mode), ...canvasRows(24, 24, rows, 12), gap: 12 };
}
function placement(mode, extra = {}, rows) {
  return mapCanvasPlacement(normalizePlacement({ gridColumns: COLUMNS[mode], column: 3, columnSpan: 3, row: 6, rowSpan: 10, rotation: 27, layer: 4, ...extra }, mode), mode, geometry(mode, rows));
}
const area = rect => rect.width * rect.height;
const error = (rect, ratio) => Math.abs(Math.log(rect.width / rect.height / ratio));
const near = (a, b, tolerance = .001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function snapped(value) {
  const { _rect: rect, _canvas: g } = value;
  assert.equal(savedCanvasPlacement(value).free?.anchorY, undefined);
  for (const [tracks, key, end] of [[g.columns, 'left', false], [g.columns, 'left', true], [g.rows, 'top', false], [g.rows, 'top', true]]) {
    const edge = rect[key] + (end ? rect[key === 'left' ? 'width' : 'height'] : 0);
    assert.ok(tracks.some(track => Math.abs(track[end ? 'end' : 'start'] - edge) < .001));
  }
}

test('shape selection approaches its visual proportions while retaining area and center', () => {
  for (const mode of Object.keys(COLUMNS)) for (const shape of ['circle', 'clover', 'flower', 'scallop', 'tilted-oval', 'arch', 'ellipse', 'soft-square', 'diamond']) {
    const start = placement(mode), ratio = preferredShapeRatio(shape);
    const original = structuredClone(start);
    const next = fitCanvasPlacementToRatio(start, mode, ratio);
    assert.ok(error(next._rect, ratio) < error(start._rect, ratio));
    assert.ok(Math.abs(area(next._rect) / area(start._rect) - 1) < .2);
    const column = start._canvas.columns[start.column - 1];
    near(next._rect.left + next._rect.width / 2, start._rect.left + start._rect.width / 2, column.end - column.start + start._canvas.gap);
    near(next._rect.top + next._rect.height / 2, start._rect.top + start._rect.height / 2, 36);
    assert.equal(next.rotation, 27);
    assert.equal(next.layer, 4);
    snapped(next);
    const reopened = mapCanvasPlacement(savedCanvasPlacement(next), mode, next._canvas);
    for (const key of ['left', 'top', 'width', 'height']) near(reopened._rect[key], next._rect[key]);
    assert.deepEqual(start, original);
  }
});

test('Diamond starts near square and remains freely resizable', () => {
  for (const shape of ['flower', 'scallop', 'diamond']) assert.equal(preferredShapeRatio(shape), 1);
  for (const mode of Object.keys(COLUMNS)) {
    const start = placement(mode);
    const fitted = fitCanvasPlacementToRatio(start, mode, preferredShapeRatio('diamond'));
    assert.ok(error(fitted._rect, 1) < error(start._rect, 1));
    snapped(fitted);
    const resized = dragResizePlacement(start, mode, 'e', 30, 0, minimum, imageResizeRatio({ shape: 'diamond' }, start));
    assert.ok(resized._rect.width > start._rect.width);
    near(resized._rect.height, start._rect.height);
    const { width, height } = resized._rect;
    const { x, y } = shapeInsets(width, height, 'diamond');
    near(width - 2 * x, height - 2 * y);
  }
});

test('a broad image becomes closer to square and stays within the canvas at either edge', () => {
  for (const column of [1, 16]) {
    const start = placement('desktop', { column, columnSpan: 9, row: 1, rowSpan: 2 });
    const next = fitCanvasPlacementToRatio(start, 'desktop', 1);
    assert.ok(error(next._rect, 1) < error(start._rect, 1));
    assert.ok(next._rect.left >= 0 && next._rect.top >= 0);
    assert.ok(next._rect.left + next._rect.width <= next._canvas.width + .001);
    snapped(next);
  }
  const bottom = placement('desktop', { row: MAX_ROWS - 1, rowSpan: 2, columnSpan: 9 }, MAX_ROWS);
  const fitted = fitCanvasPlacementToRatio(bottom, 'desktop', 1);
  assert.ok(fitted._rect.top + fitted._rect.height <= fitted._canvas.contentEnd + .001);
  snapped(fitted);
});

test('None, missing measurements and an already suitable frame leave placement alone', () => {
  const start = placement('desktop');
  for (const ratio of [preferredShapeRatio('none'), preferredShapeRatio('invalid'), NaN, 0, -1, Infinity]) {
    assert.equal(fitCanvasPlacementToRatio(start, 'desktop', ratio), start);
  }
  assert.equal(fitCanvasPlacementToRatio(start, 'desktop', start._rect.width / start._rect.height), start);
  const unmeasured = { column: 1, row: 1, columnSpan: 4, rowSpan: 5 };
  assert.equal(fitCanvasPlacementToRatio(unmeasured, 'desktop', 1), unmeasured);
});

test('saving a mobile shape fit preserves other views, crop position and existing preferences', () => {
  const saved = compactCanvas({ fill: false, imagePosition: { x: .2, y: .7 },
    desktop: savedCanvasPlacement(placement('desktop')), tablet: savedCanvasPlacement(placement('tablet')) });
  const image = { clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: saved } };
  const layouts = resolveLayouts([image], Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, geometry(mode)])));
  const fitted = fitCanvasPlacementToRatio(layouts.image.mobile, 'mobile', 1);
  const next = { ...savePlacement(saved, layouts.image, 'mobile', fitted), shape: 'clover' };
  assert.deepEqual(next.desktop, saved.desktop);
  assert.deepEqual(next.tablet, saved.tablet);
  assert.deepEqual(next.imagePosition, saved.imagePosition);
  assert.equal(next.fill, false);
  assert.equal(next.aspectRatio, undefined);
  assert.ok(next.mobile);
  assert.equal(saved.mobile, undefined);
});

test('the next manual resize remains independent on each axis', () => {
  const fitted = fitCanvasPlacementToRatio(placement('desktop'), 'desktop', 1);
  const next = resizeCanvasWithKey(fitted, 'desktop', 1, 0, minimum);
  assert.ok(next._rect.width > fitted._rect.width);
  near(next._rect.height, fitted._rect.height);
  assert.notEqual(next._rect.width / next._rect.height, fitted._rect.width / fitted._rect.height);
});

test('all shapes honor the optional manual frame lock', () => {
  const measured = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, geometry(mode)]));
  for (const { value: shape } of IMAGE_SHAPES.slice(1)) for (const aspectRatio of [undefined, 1.7]) {
    const saved = { shape, aspectRatio, desktop: savedCanvasPlacement(placement('desktop')) };
    const image = { clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: saved } };
    const layout = resolveLayouts([image], measured).image;
    for (const mode of Object.keys(COLUMNS)) {
      const fitted = fitCanvasPlacementToRatio(layout[mode], mode, preferredShapeRatio(shape));
      const next = dragResizePlacement(fitted, mode, 'e', 30, 0, minimum, imageResizeRatio(layout, fitted));
      if (aspectRatio) near(next._rect.width / next._rect.height, fitted._rect.width / fitted._rect.height);
      else near(next._rect.height, fitted._rect.height);
      const { width, height } = next._rect;
      const { x, y } = shapeInsets(width, height, shape);
      near((width - 2 * x) / (height - 2 * y), preferredShapeRatio(shape));
      assert.equal(saved.aspectRatio, aspectRatio);
    }
  }
});

test('a grouped image keeps its fitted visible frame when converted back to source coordinates', () => {
  const image = { clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: { desktop: savedCanvasPlacement(placement('desktop')) } } };
  const group = { clientId: 'group', name: 'core/group', attributes: { [ATTRIBUTE]: { group: 1, offset: { desktop: { x: .04, y: 1.25 } } } }, innerBlocks: [image] };
  const measured = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, geometry(mode)]));
  const before = resolveCanvasLayouts([group], measured).image;
  const fitted = fitCanvasPlacementToRatio(before.desktop, 'desktop', 1);
  snapped(fitted);
  const saved = savePlacement(image.attributes[ATTRIBUTE], before, 'desktop', sourcePlacement(fitted, 'desktop', before.desktop));
  const updated = { ...group, innerBlocks: [{ ...image, attributes: { [ATTRIBUTE]: saved } }] };
  const after = resolveCanvasLayouts([updated], measured).image.desktop;
  for (const key of ['left', 'top', 'width', 'height']) near(after._rect[key], fitted._rect[key]);
  assert.equal(after.rotation, before.desktop.rotation);
});

test('Shift temporarily locks the current image ratio for every resize handle without saving the lock', () => {
  const layout = { shape: 'soft-square' };
  for (const mode of Object.keys(COLUMNS)) {
    const start = placement(mode);
    for (const handle of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      const resized = dragResizePlacement(start, mode, handle, 23, 17, minimum, imageResizeRatio(layout, start, true));
      near(resized._rect.width / resized._rect.height, start._rect.width / start._rect.height);
    }
    assert.equal(imageResizeRatio(layout, start, false), undefined);
    const unlocked = dragResizePlacement(start, mode, 'e', 23, 17, minimum, imageResizeRatio(layout, start, false));
    near(unlocked._rect.height, start._rect.height);
    assert.ok(unlocked._rect.width > start._rect.width);
    assert.equal(imageResizeRatio({ aspectRatio: 1 }, start, false), start._rect.width / start._rect.height);
  }
  assert.deepEqual(layout, { shape: 'soft-square' });
});


test('shape previews are independent proposals and preserve saved attributes until committed', () => {
  const attributes = { style: { border: { radius: '24px', color: '#123456' } }, canvas: {
    shape: 'ellipse', aspectRatio: 1.7, imagePosition: { x: .2, y: .7 },
    desktop: savedCanvasPlacement(placement('desktop')), mobile: savedCanvasPlacement(placement('mobile')),
  } };
  const original = structuredClone(attributes);
  const geometryByMode = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, geometry(mode)]));
  const layout = resolveLayouts([{ clientId: 'image', name: 'core/image', attributes }], geometryByMode).image;
  const diamond = imageShapeUpdates(attributes, layout, 'desktop', 'diamond', true);
  const circle = imageShapeUpdates(attributes, layout, 'desktop', 'circle', true);
  assert.deepEqual(imageShapeUpdates(attributes, layout, 'desktop', 'diamond', true), diamond);
  assert.deepEqual(attributes, original);
  assert.equal(diamond.canvas.shape, 'diamond');
  assert.equal(circle.canvas.shape, 'circle');
  assert.deepEqual(circle.canvas.imagePosition, original.canvas.imagePosition);
  assert.equal(circle.canvas.aspectRatio, 1.7);
  assert.equal(circle.canvas.desktop.rotation, 0);
  assert.equal(circle.canvas.mobile.rotation, 0);
  assert.equal(circle.style.border.radius, undefined);
  assert.equal(circle.style.border.color, '#123456');
  const locked = imageShapeUpdates(attributes, layout, 'desktop', 'circle', false);
  assert.deepEqual(locked.canvas.desktop, attributes.canvas.desktop);
  assert.deepEqual(locked.canvas.mobile, attributes.canvas.mobile);
  const none = imageShapeUpdates(attributes, layout, 'desktop', 'none', true);
  assert.deepEqual(none.canvas.desktop, attributes.canvas.desktop);
  assert.equal(none.style, undefined);
});

test('decorative shapes resize the existing frame without forcing square proportions', () => {
  for (const shape of ['circle', 'clover', 'flower', 'scallop', 'tilted-oval']) for (const mode of Object.keys(COLUMNS)) {
    const start = placement(mode);
    for (const handle of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      const resized = dragResizePlacement(start, mode, handle, 23, 17, minimum, imageResizeRatio({ shape }, start));
      assert.deepEqual(resized, dragResizePlacement(start, mode, handle, 23, 17, minimum));
    }
    assert.deepEqual(resizeCanvasWithKey(start, mode, 1, 0, minimum, imageResizeRatio({ shape }, start)), resizeCanvasWithKey(start, mode, 1, 0, minimum));
    assert.equal(imageResizeRatio({ shape, aspectRatio: 1 }, start), start._rect.width / start._rect.height);
  }
});

test('applying and switching shapes preserves image dimensions across viewports', () => {
  for (const mode of Object.keys(COLUMNS)) for (const { value } of IMAGE_SHAPES) for (const shapeStretch of [undefined, false, true]) {
    const canvas = { shape: value === 'circle' ? 'clover' : 'circle', shapeStretch,
      desktop: savedCanvasPlacement(placement('desktop')), mobile: savedCanvasPlacement(placement('mobile')) };
    const attributes = { canvas };
    const geometryByMode = Object.fromEntries(Object.keys(COLUMNS).map(viewport => [viewport, geometry(viewport)]));
    const layout = resolveLayouts([{ clientId: 'image', name: 'core/image', attributes }], geometryByMode).image;
    const next = imageShapeUpdates(attributes, layout, mode, value, true).canvas;
    for (const viewport of ['desktop', 'mobile']) {
      const { rotation: beforeRotation, ...before } = canvas[viewport];
      const { rotation: afterRotation, ...after } = next[viewport];
      assert.deepEqual(after, before);
    }
  }
});
