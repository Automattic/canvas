import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, rowHeightForWidth } from '../src/placement.mjs';
import { canvasColumns, canvasRows, nudgeCanvasPlacement } from '../src/canvas-geometry.mjs';
import { responsiveRowMetrics } from '../src/section-layout.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { insetFrame } from '../src/frame-gap.mjs';

const close = (a,b) => assert.ok(Math.abs(a-b)<.001, `${a} != ${b}`);
const blocks = [2,10,18].map((column,index)=>({clientId:String(index),name:'core/image',attributes:{canvas:{
  desktop:{column,columnSpan:6,row:3,rowSpan:7,gridColumns:24,frameRatio:1}
}}}));
function geometry(width,x,y=x) {
  const padding={top:0,bottom:0,left:30,right:30};
  const inset=Math.max(30,(width-1340)/2);
  const all=Object.fromEntries(Object.keys(COLUMNS).map(mode=>[mode,{
    ...canvasColumns(width,padding,inset,width-inset,x,mode,COLUMNS[mode],mode==='desktop'?{...padding,left:inset,right:inset}:padding),
    ...canvasRows(0,0,12,y,rowHeightForWidth(width-60,mode)),
    gap:y,referenceWidth:1400,referenceColumns:24,viewport:mode
  }]));
  for(const mode of Object.keys(COLUMNS)) all[mode]=responsiveRowMetrics(blocks,mode,all);
  return all;
}
const viewport=width=>width<=480?'mobile':width<=782?'tablet':'desktop';

test('Gap changes the space inside fixed areas without changing grid positions, rows, or section height',()=>{
  const authored=JSON.stringify(blocks);
  for(const width of [320,390,480,481,782,783,1400,2560]) {
    const mode=viewport(width),baseline=geometry(width,0);
    const initial=resolveLayouts(blocks,baseline);
    for(const [x,y] of [[0,0],[8,8],[24,24],[48,48],[24,0],[0,24]]) {
      const all=geometry(width,x,y),g=all[mode],resolved=resolveLayouts(blocks,all);
      close(g.height,baseline[mode].height);
      for(const axis of ['columns','rows']) {
        assert.equal(g[axis].length,baseline[mode][axis].length);
        g[axis].forEach((cell,i)=>{close(cell.start,baseline[mode][axis][i].start);close(cell.end,baseline[mode][axis][i].end);});
      }
      assert.equal(g.coreRows,12);
      const frames=blocks.map(({clientId:id})=>{
        for(const key of ['left','top','width','height']) close(resolved[id][mode]._rect[key],initial[id][mode]._rect[key]);
        const area=initial[id][mode]._rect,frame=insetFrame(resolved[id][mode],g.insetGap,true);
        close(frame.left+frame.width/2,area.left+area.width/2);
        close(frame.top+frame.height/2,area.top+area.height/2);
        close(frame.width/frame.height,area.width/area.height);
        assert.ok(frame.width>0&&frame.width<=area.width);
        assert.ok(frame.height>0&&frame.height<=area.height);
        return frame;
      });
      close(frames[1].left-frames[0].left-frames[0].width,frames[2].left-frames[1].left-frames[1].width);
    }
  }
  assert.equal(JSON.stringify(blocks),authored);
});

test('unlinked Gap adjusts only the requested text axis and clamps small frames',()=>{
  const p={_rect:{left:0,top:0,width:100,height:80}};
  assert.deepEqual(insetFrame(p,{x:24,y:0}),{left:12,top:0,width:76,height:80});
  assert.deepEqual(insetFrame(p,{x:0,y:24}),{left:0,top:12,width:100,height:56});
  const tiny=insetFrame(p,{x:1000,y:1000});
  assert.equal(tiny.width,1);assert.equal(tiny.height,1);
});

test('editing after a Gap change saves the assigned area and reopens without applying Gap twice',()=>{
  for(const width of [390,600,1400]) {
    const mode=viewport(width),all=geometry(width,24),sample=structuredClone(blocks);
    const layout=resolveLayouts(sample,all)['0'];
    const next=nudgeCanvasPlacement(layout[mode],mode,1,0);
    const expected=insetFrame(next,all[mode].insetGap,true);
    sample[0].attributes.canvas=savePlacement(sample[0].attributes.canvas,layout,mode,next);
    const reopened=resolveLayouts(JSON.parse(JSON.stringify(sample)),all)['0'][mode];
    const actual=insetFrame(reopened,all[mode].insetGap,true);
    for(const key of ['left','top','width','height']) close(actual[key],expected[key]);
    assert.ok(!JSON.stringify(sample).includes('insetGap'));
  }
});
