import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE, COLUMNS, rowHeightForWidth } from '../src/placement.mjs';
import { canvasColumns, canvasRows, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { centerInSection } from '../src/selection-movement.mjs';

const widths = [320, 390, 480, 481, 600, 782, 783, 1280, 1920, 2560, 3840];
const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const geometry = (width, rows = 12, padding = { top: 0, bottom: 0, left: 50, right: 50 }) => Object.fromEntries(Object.keys(COLUMNS).map(mode => {
  const inset = Math.max(padding.left, (width - 1340) / 2);
  const gridPadding = mode === 'desktop' ? { ...padding, left: inset, right: inset } : padding;
  return [mode, { ...canvasColumns(width, padding, inset, width - inset, 24, mode, COLUMNS[mode], gridPadding),
    ...canvasRows(padding.top, padding.bottom, rows, 24, rowHeightForWidth(width - gridPadding.left - gridPadding.right, mode)), gap: 24, viewport: mode }];
}));
const block = saved => ({ clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: saved } });
const page10 = { desktop: { column: 8, row: 2, columnSpan: 11, rowSpan: 9, gridColumns: 24,
  free: { x: .3118863049095607, y: 1.500000000000001, width: .37622739018087853, ratio: 1.521802750951127 },
  frameRatio: 1.5218, anchors: { left: 6 } } };


test('precise frames retain row offsets through section growth at every responsive width', () => {
  const before=structuredClone(page10);
  for(const width of widths) {
    const mode=width<=480?'mobile':width<=782?'tablet':'desktop';
    const a=resolveLayouts([block(page10)],geometry(width,12)).image[mode];
    const b=resolveLayouts([block(page10)],geometry(width,30)).image[mode];
    for(const key of ['left','top','width','height']) close(a._rect[key],b._rect[key]);
    assert.equal(savedCanvasPlacement(b).free.anchorY,undefined);
  }
  assert.deepEqual(page10,before);
});

test('centering positions a block once and explicit viewport edits remain independent', () => {
  const g=geometry(1280,24), layouts=resolveLayouts([block(page10)],g);
  const centered=centerInSection(layouts.image.desktop,'desktop','vertical');
  close(centered._rect.top+centered._rect.height/2,g.desktop.height/2);
  const original={...page10,mobile:{column:2,row:8,columnSpan:4,rowSpan:3,gridColumns:12}};
  const saved=savePlacement(original,layouts.image,'desktop',centered);
  assert.deepEqual(saved.mobile,original.mobile);assert.equal(saved.tablet,undefined);
  const reopened=resolveLayouts([block(saved)],geometry(1280,32)).image.desktop;
  close(reopened._rect.top,centered._rect.top);
  close(reopened._rect.height,centered._rect.height);
});

test('a taller sibling does not move or stretch existing text and image frames', () => {
  for(const name of ['core/image','core/paragraph','core/buttons']) {
    const item={...block(page10),name};
    const g=geometry(1280,12);
    const before=resolveLayouts([item],g).image.desktop;
    const tall={clientId:'tall',name:'core/image',attributes:{canvas:{desktop:{column:1,row:1,columnSpan:3,rowSpan:30,gridColumns:24}}}};
    const after=resolveLayouts([item,tall],g).image.desktop;
    for(const key of ['left','top','width','height']) close(after._rect[key],before._rect[key]);
  }
});
