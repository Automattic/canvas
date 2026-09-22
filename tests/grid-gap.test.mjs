import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, rowHeightForWidth } from '../src/placement.mjs';
import { canvasColumns, canvasRows, dragMovePlacement, dragResizePlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { responsiveRowMetrics } from '../src/section-layout.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';

const close = (a,b) => assert.ok(Math.abs(a-b)<.001, `${a} != ${b}`);
const viewport = width => width<=480?'mobile':width<=782?'tablet':'desktop';
function geometry(width,x,y=x) {
  const padding={top:0,bottom:0,left:30,right:30};
  const inset=Math.max(30,(width-1340)/2);
  const all=Object.fromEntries(Object.keys(COLUMNS).map(mode=>[mode,{
    ...canvasColumns(width,padding,inset,width-inset,x,mode,COLUMNS[mode],mode==='desktop'?{...padding,left:inset,right:inset}:padding),
    ...canvasRows(0,0,20,y,rowHeightForWidth(width-60,mode)),
    gap:y,referenceWidth:1400,referenceColumns:24,viewport:mode
  }]));
  for(const mode of Object.keys(COLUMNS)) all[mode]=responsiveRowMetrics([],mode,all);
  return all;
}
function assertCellEdges(p) {
  const {_rect:r,_canvas:g}=p;
  assert.ok(g.columns.some(c=>Math.abs(c.start-r.left)<.001), `left ${r.left}`);
  assert.ok(g.columns.some(c=>Math.abs(c.end-r.left-r.width)<.001), `right ${r.left+r.width}`);
  assert.ok(g.rows.some(c=>Math.abs(c.start-r.top)<.001), `top ${r.top}`);
  assert.ok(g.rows.some(c=>Math.abs(c.end-r.top-r.height)<.001), `bottom ${r.top+r.height}`);
}

test('nonzero linked and unlinked Gap leaves the outer grid edges flush and spaces only between cells',()=>{
  for(const width of [320,390,480,481,782,783,1400,2560,3840]) {
    const mode=viewport(width);
    for(const [x,y] of [[8,8],[24,24],[48,48],[24,0],[0,24],[8,32]]) {
      const g=geometry(width,x,y)[mode],columns=g.contentColumns;
      close(columns[0].start,mode==='desktop'?g.wideStart:g.padding.left);
      close(columns.at(-1).end,mode==='desktop'?g.wideEnd:g.width-g.padding.right);
      close(g.rows[g.before].start,g.padding.top);
      close(g.rows[g.before+g.coreRows-1].end,g.height-g.padding.bottom);
      close(g.rows[g.before+1].start-g.rows[g.before].end,g.gap);
      assert.equal(g.insetGap,undefined);
      if(x) assert.ok(columns[1].start>columns[0].end);
      else close(columns[1].start,columns[0].end);
      assert.equal(g.coreRows,20);
    }
  }
});

test('moving and resizing images and text with Gap commits visible cell edges through save and reload',()=>{
  for(const width of [320,390,600,1400,2560,3840]) for(const [x,y] of [[24,24],[8,32],[32,8]]) {
    const mode=viewport(width),all=geometry(width,x,y);
    for(const name of ['core/image','core/heading','core/paragraph','core/buttons']) {
      const blocks=[{clientId:'item',name,attributes:{canvas:{[mode]:{
        column:3,columnSpan:6,row:3,rowSpan:7,gridColumns:COLUMNS[mode]
      }}}}];
      const initial=resolveLayouts(blocks,all).item,minimum={columnSpan:1,rowSpan:1};
      const start=initial[mode];
      assertCellEdges(start);
      for(const preview of [
        dragMovePlacement(start,mode,all[mode].columnPitch,all[mode].rowHeight+all[mode].gap,minimum),
        dragResizePlacement(start,mode,'se',all[mode].columnPitch,all[mode].rowHeight+all[mode].gap,minimum),
      ]) {
        const moved=preview._rect.width===start._rect.width;
        const drop=snapCanvasPlacement(preview,mode,minimum,moved?start:undefined,0);
        assertCellEdges(drop);
        const saved=savePlacement(blocks[0].attributes.canvas,initial,mode,drop);
        const reopened=resolveLayouts([{...blocks[0],attributes:{canvas:JSON.parse(JSON.stringify(saved))}}],all).item[mode];
        assertCellEdges(reopened);
        for(const key of ['left','top','width','height']) close(reopened._rect[key],drop._rect[key]);
        assert.ok(!JSON.stringify(saved).includes('insetGap'));
      }
    }
  }
});

test('wide and canvas guidelines remain exact visible release targets with nonzero Gap',()=>{
  for(const width of [1400,2560,3840]) {
    const all=geometry(width,24,32),g=all.desktop;
    const block={clientId:'image',name:'core/image',attributes:{canvas:{desktop:{column:3,columnSpan:6,row:3,rowSpan:6,gridColumns:24}}}};
    const initial=resolveLayouts([block],all).image,start=initial.desktop;
    for(const [axis,position] of [['left',g.wideStart],['right',g.wideEnd],['top',0],['bottom',g.height]]) {
      const horizontal=['left','right'].includes(axis),end=['right','bottom'].includes(axis);
      const edge=start._rect[horizontal?'left':'top']+(end?start._rect[horizontal?'width':'height']:0);
      const preview=dragMovePlacement(start,'desktop',horizontal?position-edge:0,horizontal?0:position-edge,{columnSpan:1,rowSpan:1});
      const drop=snapCanvasPlacement(preview,'desktop',undefined,start);
      const saved=savePlacement(block.attributes.canvas,initial,'desktop',drop);
      const reopened=resolveLayouts([{...block,attributes:{canvas:saved}}],all).image.desktop;
      for(const p of [drop,reopened]) close(p._rect[horizontal?'left':'top']+(end?p._rect[horizontal?'width':'height']:0),position);
    }
  }
});
