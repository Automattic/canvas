import test from 'node:test';
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
