import test from 'node:test';
import { freeFrameFromRect } from '../src/aspect-ratio.mjs';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { COLUMNS, rowHeightForWidth } from '../src/placement.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { responsiveRowMetrics, sectionRows } from '../src/section-layout.mjs';
import { readablePlacements } from '../src/automatic-layout.mjs';
import { resolveAutomaticContent } from '../src/automatic-content.mjs';

const close = (a, b, tolerance = .001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const image = { matches: () => false, querySelector: () => null,
  classList: { contains: name => name === 'canvas__image' },
  getAttribute: name => name === 'data-canvas-auto' ? 'tablet mobile' : null };
const block = (id, desktop, name = 'core/image') => ({ clientId: String(id), name, attributes: { canvas: { desktop } } });
const trio = () => [10,18,2].map((column, id) => block(id, { column, row:3, columnSpan:6, rowSpan:7, gridColumns:24, frameRatio:.959808 }));
const widths = [320,390,480,481,600,782,783,1024,1440,2000,2560,3840];
function geometry(width, blocks, gap = 24, padding = {left:30,right:30,top:0,bottom:0}) {
  const rows = sectionRows(blocks, {desktop:11,tablet:1,mobile:1});
  const inset = Math.max(padding.left, (width - 1340) / 2);
  const all = Object.fromEntries(Object.keys(COLUMNS).map(mode => {
    const gridPadding = mode === 'desktop' ? {...padding,left:inset,right:inset} : padding;
    return [mode, {...canvasColumns(width,padding,inset,width-inset,gap,mode,COLUMNS[mode],gridPadding),
      ...canvasRows(padding.top,padding.bottom,rows[mode],gap,rowHeightForWidth(width-gridPadding.left-gridPadding.right,mode)),
      gap, viewport:mode, referenceWidth:1400, referenceColumns:24}];
  }));
  for(const mode of Object.keys(COLUMNS)) all[mode] = responsiveRowMetrics(blocks,mode,all);
  return all;
}
const active = width => width <= 480 ? 'mobile' : width <= 782 ? 'tablet' : 'desktop';
const sortedRects = (blocks, all, mode) => Object.values(resolveLayouts(blocks,all)).map(p=>p[mode]._rect).sort((a,b)=>a.left-b.left);

test('three equal images retain exact margins, spacing, size, and rows across every density', () => {
  for(const gap of [0,8,24,48]) {
    const blocks=trio(), saved=JSON.stringify(blocks), reference=geometry(1400,blocks,gap);
    const expected=sortedRects(blocks,reference,'desktop');
    for(const width of [...widths,...widths.toReversed()]) {
      const mode=active(width), all=geometry(width,blocks,gap), g=all[mode];
      const actual=sortedRects(blocks,all,mode);
      const scale=(g.contentColumns.at(-1).end-g.contentColumns[0].start)/1340;
      const offset=g.contentColumns[0].start;
      for(let i=0;i<3;i++) {
        close(actual[i].left-offset,(expected[i].left-30)*scale);
        close(actual[i].width,expected[i].width*scale);
        close(actual[i].top,expected[i].top*scale);
        close(actual[i].height,expected[i].height*scale);
      }
      close(actual[1].left-actual[0].left-actual[0].width,actual[2].left-actual[1].left-actual[1].width);
      close(g.height,reference.desktop.height*scale);
      assert.equal(g.coreRows,11);
      if(mode !== 'desktop') {
        const layouts=resolveLayouts(blocks,all);
        const result=resolveAutomaticContent([image,image,image],mode,g,blocks.map(b=>layouts[b.clientId][mode]),blocks.map(b=>layouts[b.clientId].desktop),blocks.map(b=>b.attributes.canvas.desktop));
        assert.deepEqual(result,{},'No second projection or reflow for image compositions');
      }
    }
    assert.equal(JSON.stringify(blocks),saved);
  }
});

test('section scale is independent of block count, type, and responsive edits', () => {
  const blocks=trio();
  for(const width of widths) {
    const mode=active(width), g=geometry(width,blocks)[mode];
    for(const sample of [[],[blocks[0]],blocks,blocks.map(b=>({...b,name:'core/paragraph'}))]) {
      const other=geometry(width,sample)[mode];
      close(g.gap,other.gap); close(g.columnGap,other.columnGap); close(g.rowHeight,other.rowHeight);
    }
  }
});

test('numeric and named anchors retain their meaning without mobile edge rounding', () => {
  for(const anchors of [{left:'wide'}, {right:'wide'}, {left:'canvas',right:'canvas'}, {left:'padding',right:'padding'}, {left:2,right:8}]) {
    const blocks=[block('a',{column:3,row:3,columnSpan:6,rowSpan:7,gridColumns:24,anchors})];
    for(const width of widths.filter(w=>w<783)) {
      const mode=active(width), all=geometry(width,blocks), g=all[mode];
      const p=resolveLayouts(blocks,all).a[mode];
      const target={wide:[g.wideStart,g.wideEnd],canvas:[0,width],padding:[30,width-30]};
      if(typeof anchors.left==='string') close(p._rect.left,target[anchors.left][0]);
      if(typeof anchors.right==='string') close(p._rect.left+p._rect.width,target[anchors.right][1]);
      assert.ok(p._rect.width>0 && p._rect.height>0);
      assert.equal(blocks[0].attributes.canvas.mobile,undefined);
    }
  }
});

test('explicit tablet/mobile placement and saving inherited geometry are stable', () => {
  const blocks=trio();
  const all=geometry(390,blocks), before=resolveLayouts(blocks,all)['0'];
  blocks[0].attributes.canvas=savePlacement(blocks[0].attributes.canvas,before,'mobile',before.mobile);
  const after=resolveLayouts(blocks,geometry(390,blocks))['0'];
  for(const key of ['left','top','width','height']) close(before.mobile._rect[key],after.mobile._rect[key]);
  blocks[1].attributes.canvas.tablet={column:2,columnSpan:4,row:2,rowSpan:3,gridColumns:12};
  blocks[1].attributes.canvas.mobile={column:1,columnSpan:8,row:1,rowSpan:4,gridColumns:8};
  const g=geometry(390,blocks), resolved=resolveLayouts(blocks,g)['1'];
  close(resolved.mobile._rect.left,30); close(resolved.mobile._rect.width,330);
  assert.equal(savedCanvasPlacement(resolved.mobile).columnSpan,12);
  assert.equal(JSON.stringify(blocks).includes('_rect'),false);
});

test('precise service images stop growing at wide width and keep their gaps', () => {
  const blocks = [.05, .35625, .6625].map((x, index) => block(index, {
    column: index * 8 + 1, row: 3, columnSpan: 8, rowSpan: 10, gridColumns: 24,
    free: { x, y: 3, width: .2875, ratio: .99064 }, frameRatio: 1.01284,
    anchors: index === 0 ? { left: 'wide' } : index === 2 ? { right: 'wide' } : {},
  }));
  const saved = JSON.stringify(blocks);
  const expected = sortedRects(blocks, geometry(1400, blocks), 'desktop');
  for (const width of [1400, 1600, 2000, 2560, 3840]) {
    const actual = sortedRects(blocks, geometry(width, blocks), 'desktop');
    actual.forEach((rect, index) => {
      close(rect.width, expected[index].width);
      close(rect.height, expected[index].height);
      close(rect.left - (width - 1400) / 2, expected[index].left);
      if (index) assert.ok(rect.left > actual[index - 1].left + actual[index - 1].width);
    });
  }
  assert.equal(JSON.stringify(blocks), saved);
});

test('precise fitted headings share the wide cap and reopen after editing', () => {
  const blocks = [block('word', {
    column: 1, row: 3, columnSpan: 15, rowSpan: 7, gridColumns: 24,
    free: { x: .103785, y: 1, width: .489947, ratio: 2.396795 }, anchors: { left: 'wide' },
  }, 'core/heading'), block('press', {
    column: 9, row: 9, columnSpan: 16, rowSpan: 7, gridColumns: 24,
    free: { x: .372659, y: 7, width: .523556, ratio: 2.56121 }, anchors: { right: 'wide' },
  }, 'core/heading')];
  blocks.forEach(b => b.attributes.canvas.fill = true);
  const expected = resolveLayouts(blocks, geometry(1400, blocks));
  for (const width of [1400, 2000, 3840]) {
    const all = geometry(width, blocks);
    const resolved = resolveLayouts(blocks, all);
    for (const b of blocks) {
      const p = resolved[b.clientId].desktop;
      close(p._rect.width, expected[b.clientId].desktop._rect.width);
      close(p._rect.height, expected[b.clientId].desktop._rect.height);
      const free = freeFrameFromRect(p._rect, all.desktop);
      const reopened = mapCanvasPlacement({ ...savedCanvasPlacement(p), free }, 'desktop', all.desktop);
      for (const key of ['left', 'top', 'width', 'height']) close(reopened._rect[key], p._rect[key]);
    }
  }
});

test('capped artwork can move through both outer gutters and reopen there', async () => {
  const { dragMovePlacement, dragCanvasPlacement } = await import('../src/canvas-geometry.mjs');
  const blocks = [block('a', { column: 9, row: 3, columnSpan: 8, rowSpan: 4, gridColumns: 24 })];
  for (const width of [2000, 3840]) {
    const all = geometry(width, blocks), g = all.desktop;
    const resolved = resolveLayouts(blocks, all).a;
    for (const target of [20, width - resolved.desktop._rect.width - 20]) {
      const dx = target - resolved.desktop._rect.left;
      const preview = dragMovePlacement(resolved.desktop, 'desktop', dx, 0, { columnSpan: 1, rowSpan: 1 });
      close(preview._rect.left, target);
      close(preview._rect.width, resolved.desktop._rect.width);
      const committed = dragCanvasPlacement(resolved.desktop, 'desktop', 'move', dx, 0, { columnSpan: 1, rowSpan: 1 });
      const saved = savePlacement(blocks[0].attributes.canvas, resolved, 'desktop', committed);
      const reopened = resolveLayouts([{ ...blocks[0], attributes: { canvas: saved } }], all).a.desktop;
      for (const key of ['left', 'top', 'width', 'height']) close(reopened._rect[key], committed._rect[key], .01);
      if (target === 20) assert.ok(reopened._rect.left < g.wideStart);
      else assert.ok(reopened._rect.left + reopened._rect.width > g.wideEnd);
    }
    for (const rect of [
      { left: 0, top: 20, width, height: 200 },
      { left: 20, top: 20, width: 150, height: 200 },
      { left: width - 170, top: 20, width: 150, height: 200 },
    ]) {
      const free = freeFrameFromRect(rect, g);
      const placement = { column: 1, row: 1, columnSpan: 2, rowSpan: 2, gridColumns: 24, free };
      const reopened = mapCanvasPlacement(placement, 'desktop', g);
      for (const key of ['left', 'top', 'width', 'height']) close(reopened._rect[key], rect[key]);
    }
  }
});
