import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { gridAlignedPlacement } from '../src/grid-placement.mjs';
import { moveSelection } from '../src/selection-movement.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { responsiveRowMetrics } from '../src/section-layout.mjs';
import { rowHeightForWidth } from '../src/placement.mjs';

function geometry(width, inset = 50) {
  const padding = { left: inset, right: inset, top: 0, bottom: 0 };
  const all = Object.fromEntries(['desktop', 'tablet', 'mobile'].map(mode => [mode, {
    ...canvasColumns(width, padding, inset, width-inset, 10, mode),
    ...canvasRows(0, 0, 17, 10, rowHeightForWidth(width-2*inset, mode)),
    gap: 10, viewport: mode, referenceWidth: 1340+2*inset, referenceColumns: 24,
  }]));
  for (const mode of Object.keys(all)) all[mode] = responsiveRowMetrics([], mode, all);
  return all;
}
const block = (id, desktop) => ({ clientId:id, name:'core/image', attributes:{canvas:{desktop}} });
const close = (a,b) => assert.ok(Math.abs(a-b)<.002, `${a} != ${b}`);

test('moving grid images together saves cells and retains equal mobile sizes', () => {
  const all = geometry(1440);
  const blocks = [9,1,17].map((column,i) => block(String(i), {
    column, row:3, columnSpan:8, rowSpan:11, gridColumns:24, frameRatio:1.05539,
  }));
  const layouts = resolveLayouts(blocks, all);
  const moved = moveSelection(layouts, ['1','2'], 'desktop', '1', 0,
    all.desktop.rowHeight+all.desktop.gap, {snap:true});
  for (const id of ['1','2']) {
    assert.ok(moved[id].free, 'selection transform produces a precise frame');
    const placement = gridAlignedPlacement(moved[id], 'desktop');
    assert.equal(placement.free, undefined);
    for (const key of ['left','top','width','height']) close(placement._rect[key], moved[id]._rect[key]);
    blocks[Number(id)].attributes.canvas = savePlacement(blocks[Number(id)].attributes.canvas, layouts[id], 'desktop', placement);
    assert.equal(blocks[Number(id)].attributes.canvas.desktop.free, undefined);
  }
  for (const width of [320,390,480,600,782]) {
    const mode = width <= 480 ? 'mobile' : 'tablet';
    const result = resolveLayouts(blocks, geometry(width, 20));
    for (const id of ['1','2']) {
      close(result[id][mode]._rect.width, result['0'][mode]._rect.width);
      close(result[id][mode]._rect.height, result['0'][mode]._rect.height);
    }
  }
});

test('supplied rounded precise grid frame can be saved as cells without changing its size', () => {
  const g = geometry(1440).desktop;
  for (const [column,x] of [[1,.034722],[17,.659722]]) {
    const frame = mapCanvasPlacement({column,row:4,columnSpan:8,rowSpan:11,gridColumns:24,
      free:{x,y:3,width:.305556,ratio:1.055385},frameRatio:1.05539}, 'desktop', g);
    const clean = gridAlignedPlacement(frame, 'desktop');
    assert.equal(clean.free, undefined);
    for(const key of ['left','top','width','height']) close(clean._rect[key],frame._rect[key]);
  }
});

test('Grid saves snap off-grid positions and dimensions to cells', () => {
  const g = geometry(1440).desktop;
  for(const free of [
    {x:.034722,y:3,width:.31,ratio:1.055385},
    {x:.035,y:3,width:.305556,ratio:1.055385},
    {x:.034722,y:3.1,width:.305556,ratio:1.055385},
  ]) {
    const frame = mapCanvasPlacement({column:1,row:4,columnSpan:8,rowSpan:11,gridColumns:24,free}, 'desktop', g);
    const snapped = gridAlignedPlacement(frame,'desktop');
    assert.equal(snapped.free, undefined);
    const restored = mapCanvasPlacement(snapped._base, 'desktop', g);
    for (const key of ['left','top','width','height']) close(restored._rect[key], snapped._rect[key]);
  }
});
