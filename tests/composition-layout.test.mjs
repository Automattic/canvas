import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, normalizePlacement, rowHeightForWidth } from '../src/placement.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveLayouts } from '../src/geometry.mjs';
import { readablePlacements } from '../src/automatic-layout.mjs';
import { responsiveRowMetrics } from '../src/section-layout.mjs';

const original = [
  { column: 7, row: 3, columnSpan: 12, rowSpan: 13, gridColumns: 24, frameRatio: 1.03754 },
  { column: 6, row: 3, columnSpan: 14, rowSpan: 4, gridColumns: 24 },
  { column: 5, row: 12, columnSpan: 14, rowSpan: 4, gridColumns: 24 },
  { column: 10, row: 8, columnSpan: 5, rowSpan: 3, gridColumns: 24, anchors: { right: 15 } },
];
const revised = [
  { column: 4, row: 4, columnSpan: 20, rowSpan: 11, gridColumns: 24,
    free: { x: .13629191321499015, y: 3.000012199376193, width: .7274161735700196, ratio: 2.08355 }, frameRatio: 2.08355 },
  { column: 6, row: 2, columnSpan: 14, rowSpan: 5, gridColumns: 24 },
  { column: 6, row: 12, columnSpan: 14, rowSpan: 5, gridColumns: 24 },
  { column: 10, row: 8, columnSpan: 6, rowSpan: 4, gridColumns: 24 },
];
const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const center = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const geometry = (width, rows) => { const all = Object.fromEntries(Object.entries(COLUMNS).map(([mode, count]) => {
  const padding = { top: 0, bottom: 0, left: 30, right: 30 };
  const inset = Math.max(30, (width - 1340) / 2);
  const gridPadding = mode === 'desktop' ? { ...padding, left: inset, right: inset } : padding;
  return [mode, { ...canvasColumns(width, padding, inset, width - inset, 24, mode, count, gridPadding),
    ...canvasRows(0, 0, rows, 24, rowHeightForWidth(width - gridPadding.left - gridPadding.right, mode)),
    gap: 24, viewport: mode, referenceWidth: 1400, referenceColumns: 24 }];
})); for (const mode of Object.keys(COLUMNS)) all[mode]=responsiveRowMetrics([],mode,all); return all; };
const kinds = ['image', 'heading', 'heading', 'buttons'];
const measure = (item, width) => item.kind === 'buttons' ? 56 : width * .36;
function example(saved, rows, width) {
  const blocks = saved.map((desktop, index) => ({ clientId: index, name: `core/${kinds[index]}`, attributes: { canvas: { desktop } } }));
  const reference = geometry(1400, rows);
  const sources = resolveLayouts(blocks, reference);
  const all = geometry(width, rows);
  const mode = width <= 480 ? 'mobile' : 'tablet';
  const layouts = resolveLayouts(blocks, all);
  const placements = blocks.map((_, index) => layouts[index][mode]);
  const items = blocks.map((_, index) => ({ index, kind: kinds[index], automatic: true,
    source: normalizePlacement(saved[index]), sourceRect: sources[index].desktop._rect,
    sourceLeft: (placements[index]._rect.left-30)/(width-60), sourceRight: (placements[index]._rect.left+placements[index]._rect.width-30)/(width-60), sourceCanvasHeight: reference.desktop.height, minWidth: index === 3 ? 192 : 0, widthFit: index === 1 || index === 2 }));
  return { all, mode, items, placements };
}

for (const [name,saved,rows] of [['original',original,17],['revised',revised,18]]) {
  test(`${name} image composition retains authored rows and proportional positions`,()=>{
    const before=structuredClone(saved);
    const reference=example(saved,rows,1400);
    const base=resolveLayouts(saved.map((desktop,index)=>({clientId:index,name:`core/${kinds[index]}`,attributes:{canvas:{desktop}}})),geometry(1400,rows));
    for(const width of [320,390,480,481,600,782]) {
      const {all,mode,items,placements}=example(saved,rows,width),g=all[mode];
      const scale=(width-60)/1340;
      assert.equal(g.coreRows,rows);
      close(g.height,geometry(1400,rows).desktop.height*scale);
      for(let index=0;index<placements.length;index++) {
        const r=placements[index]._rect,source=base[index].desktop._rect;
        close(r.left-30,(source.left-30)*scale);
        close(r.width,source.width*scale);
      }
      const automatic=readablePlacements(items,mode,g,placements,measure);
      assert.equal(automatic[0],undefined,'Readability does not resize the artwork');
      const button=mapCanvasPlacement(automatic[3]||placements[3],mode,g)._rect;
      assert.ok(button.width>=192 && button.height>=56);
      close(center(button).x,center(placements[3]._rect).x);
    }
    assert.deepEqual(saved,before);
  });
}
