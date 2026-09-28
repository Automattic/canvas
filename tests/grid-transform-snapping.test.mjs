import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { gridAlignedPlacement } from '../src/grid-placement.mjs';
import { distributeHorizontally, distributeVertically } from '../src/selection-distribution.mjs';
import { alignSelection, positionSelection } from '../src/selection-alignment.mjs';
import { savePlacement } from '../src/geometry.mjs';
const supplied = [
  {column:1,row:12,columnSpan:8,rowSpan:12,gridColumns:24,free:{x:.034722,y:11,width:.305556,ratio:1.008446},frameRatio:1.00845,anchors:{left:'wide',right:8}},
  {column:9,row:12,columnSpan:6,rowSpan:12,gridColumns:24,free:{x:.347222,y:11,width:.227431,ratio:.750604},frameRatio:.750604},
  {column:15,row:12,columnSpan:10,rowSpan:12,gridColumns:24,free:{x:.581597,y:11,width:.388715,ratio:1.282903},frameRatio:1.2829},
];
const near = (a,b) => Math.abs(a-b)<.002;
for (const mode of ['desktop','tablet','mobile']) {
  const g = {...canvasColumns(1440,{left:50,right:50,top:0,bottom:0},50,1390,10,mode,24), ...canvasRows(0,0,29,10),gap:10,viewport:mode,referenceWidth:1440};
  const blocks = supplied.map((desktop,i)=>({clientId:String(i),name:'core/image',attributes:{canvas:{desktop}}}));
  const ids = blocks.map(b=>b.clientId);
  const layouts = Object.fromEntries(blocks.map((b,i)=>{
    const p = mapCanvasPlacement(supplied[i],mode,g);
    return [b.clientId,{desktop:p,[mode]:p}];
  }));
  const operations = [
    ...['left','horizontal','right','top','vertical','bottom'].map(axis=>['align '+axis,()=>alignSelection(layouts,ids,mode,axis)]),
    ...['both','horizontal','vertical'].map(axis=>['position '+axis,()=>positionSelection(layouts,ids,mode,axis,{cells:true}).placements]),
  ];
  for (const [name,run] of operations) test(`supplied off-grid images: ${name} saves only cells in ${mode}`,()=>{
    const result = run();
    for (const b of blocks) {
      const snapped = gridAlignedPlacement(result[b.clientId],mode);
      const saved = savePlacement(b.attributes.canvas,layouts[b.clientId],mode,snapped);
      assert.equal(saved[mode].free,undefined);
      const restored = mapCanvasPlacement(saved[mode],mode,g);
      const r = restored._rect;
      assert.ok(g.columns.some(t=>near(t.start,r.left)), 'left edge on cell');
      assert.ok(g.columns.some(t=>near(t.end,r.left+r.width)), 'right edge on cell');
      assert.ok(g.rows.some(t=>near(t.start,r.top)), 'top edge on cell');
      assert.ok(g.rows.some(t=>near(t.end,r.top+r.height)), 'bottom edge on cell');
      for (const key of ['left','top','width','height']) assert.ok(near(r[key],snapped._rect[key]));
    }
  });
}

for(const mode of ['desktop','tablet','mobile']) for(const run of [distributeHorizontally,distributeVertically]) test(`distribution preserves supplied precise dimensions in ${mode}: ${run.name}`,()=>{
 const g={...canvasColumns(1440,{left:50,right:50,top:0,bottom:0},50,1390,10,mode,24),...canvasRows(0,0,29,10),gap:10,viewport:mode,referenceWidth:1440};
 const blocks=supplied.map((desktop,i)=>({clientId:String(i),name:'core/image',attributes:{canvas:{desktop}}}));
 const layouts=Object.fromEntries(blocks.map((b,i)=>[b.clientId,{[mode]:mapCanvasPlacement(supplied[i],mode,g)}]));
 const result=run(blocks,layouts,mode);
 for(const b of blocks) {
  const saved=savePlacement(b.attributes.canvas,layouts[b.clientId],mode,result[b.clientId]);
  const restored=mapCanvasPlacement(saved[mode],mode,g);
  for(const key of ['width','height']) assert.ok(near(restored._rect[key],layouts[b.clientId][mode]._rect[key]),key);
 }
});
