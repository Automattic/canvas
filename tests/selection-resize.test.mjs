import { selectionBounds } from '../src/rectangle-bounds.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeSelection } from '../src/selection-resize.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveCanvasLayouts, sourcePlacement } from '../src/canvas-groups.mjs';
import { savePlacement } from '../src/geometry.mjs';
import { ATTRIBUTE, COLUMNS } from '../src/placement.mjs';
const geometry = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, { ...canvasColumns(1200, {top:24,right:24,bottom:24,left:24},100,1100,12,mode), ...canvasRows(24,24,24,12),gap:12 }]));
const blocks = ['a','b'].map((id,i)=>({clientId:id,name:'core/image',attributes:{[ATTRIBUTE]:{desktop:{column:3+i*7,row:3+i*4,columnSpan:4,rowSpan:3,rotation:13+i*20,layer:i+2}}},innerBlocks:[]}));
const near=(a,b,t=.02)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
for(const mode of Object.keys(COLUMNS)) for(const snap of [false,true]) test(`${mode} proportional resize and saved round trip (snap=${snap})`,()=>{
 const layouts=resolveCanvasLayouts(blocks,geometry);
 const original=selectionBounds(blocks.map(b=>layouts[b.clientId][mode]));
 const next=resizeSelection(layouts,['a','b'],mode,'se',80,50,{snap});
 const bounds=selectionBounds(Object.values(next));
 const scale=bounds.width/original.width;
 assert.ok(scale>1);
 near(bounds.left,original.left); near(bounds.top,original.top);
 for(const id of ['a','b']) {
  const before=layouts[id][mode],after=next[id];
  near(after._rect.width/before._rect.width,scale);
  near(after._rect.height/before._rect.height,scale);
  assert.equal(after.rotation,before.rotation); assert.equal(after.layer,before.layer);
 }
 const saved=blocks.map(b=>({...b,attributes:{[ATTRIBUTE]:savePlacement(b.attributes[ATTRIBUTE],layouts[b.clientId],mode,sourcePlacement(next[b.clientId],mode,layouts[b.clientId][mode]))}}));
 const reopened=resolveCanvasLayouts(saved,geometry);
 for(const id of ['a','b']) for(const key of ['left','top','width','height']) near(reopened[id][mode]._rect[key],next[id]._rect[key]);
 if(mode!=='desktop') assert.deepEqual(reopened.a.desktop._rect,layouts.a.desktop._rect);
});
test('center resizing preserves the selection center; all handles retain proportions',()=>{
 const layouts=resolveCanvasLayouts(blocks,geometry),original=selectionBounds(blocks.map(b=>layouts[b.clientId].desktop));
 for(const kind of ['n','ne','e','se','s','sw','w','nw']) {
 const next=selectionBounds(Object.values(resizeSelection(layouts,['a','b'],'desktop',kind,45,35,{fromCenter:true})));
 near(next.left+next.width/2,original.left+original.width/2);near(next.top+next.height/2,original.top+original.height/2);near(next.width/next.height,original.width/original.height);
 }
});
test('zero movement is a no-op and shrinking preserves usable frames',()=>{
 const layouts=resolveCanvasLayouts(blocks,geometry);
 const unchanged=resizeSelection(layouts,['a','b'],'desktop','se',0,0);
 assert.equal(unchanged.a,layouts.a.desktop); assert.equal(unchanged.b,layouts.b.desktop);
 const tiny=resizeSelection(layouts,['a','b'],'desktop','se',-10000,-10000);
 for(const value of Object.values(tiny)) { assert.ok(value._rect.width>=23.99); assert.ok(value._rect.height>=23.99); }
 const huge=selectionBounds(Object.values(resizeSelection(layouts,['a','b'],'desktop','se',10000,10000)));
 assert.ok(huge.left+huge.width<=geometry.desktop.width+.01);
});

test('selection resizing cannot round past the shared bottom buffer before the pointer crosses it', () => {
 const g=geometry.desktop;
 const placements=[.35,.5].map((x,i)=>mapCanvasPlacement({free:{x,y:(g.height-180+i*40-g.padding.top)/(g.rowHeight+g.gap),width:50/g.width,ratio:1}},'desktop',g));
 const layouts={a:{desktop:placements[0]},b:{desktop:placements[1]}};
 const original=selectionBounds(placements),distance=g.height-original.top-original.height;
 for(const snap of [false,true]) for(const fromCenter of [false,true]) for(const screenScale of [1,2]) for(const overshoot of [20,24,40]) {
  const next=resizeSelection(layouts,['a','b'],'desktop','s',0,distance+overshoot*screenScale,{snap,fromCenter,screenScale});
  const bounds=selectionBounds(Object.values(next));
  near(bounds.width/bounds.height,original.width/original.height);
  near(bounds.left+bounds.width/2,original.left+original.width/2);
  if(fromCenter) near(bounds.top+bounds.height/2,original.top+original.height/2);
  else near(bounds.top,original.top);
  if(overshoot<=24) {
   assert.ok(bounds.top+bounds.height<=g.height+.01);
   for(const value of Object.values(next)) assert.equal(value._canvas.coreRows,g.coreRows);
  } else assert.ok(bounds.top+bounds.height>g.height+.01);
 }
});

test('selection resizing replaces edge constraints and full-height sizing with scaled frames', () => {
 const g=geometry.desktop;
 const anchored=blocks.map((block,i)=>({...block,attributes:{canvas:{desktop:{column:3+i*7,row:3+i*4,columnSpan:4,rowSpan:3,gridColumns:24,anchors:i?{left:'center',right:'wide'}:{left:'canvas',right:4},...(i?{fillHeight:true}:{})}}}}));
 const layouts=resolveCanvasLayouts(anchored,geometry);
 const before=selectionBounds(anchored.map(b=>layouts[b.clientId].desktop));
 const next=resizeSelection(layouts,['a','b'],'desktop','se',-80,-60);
 const after=selectionBounds(Object.values(next));
 const scale=after.width/before.width;
 assert.ok(scale<1);
 for(const id of ['a','b']) {
  const start=layouts[id].desktop;
  near(next[id]._rect.width/start._rect.width,scale);
  near(next[id]._rect.height/start._rect.height,scale);
  assert.equal(next[id].fillHeight,undefined);
  const saved=savePlacement(anchored.find(b=>b.clientId===id).attributes.canvas,layouts[id],'desktop',next[id]);
  const reopened=mapCanvasPlacement(saved.desktop,'desktop',g);
  for(const key of ['left','top','width','height']) near(reopened._rect[key],next[id]._rect[key]);
 }
});

test('keyboard selection resizing can grow beyond the pointer buffer', () => {
 const g=geometry.desktop;
 const a=mapCanvasPlacement({free:{x:.2,y:(g.height-100-g.padding.top)/(g.rowHeight+g.gap),width:100/g.width,ratio:1}},'desktop',g);
 const b=mapCanvasPlacement({free:{x:.4,y:(g.height-100-g.padding.top)/(g.rowHeight+g.gap),width:100/g.width,ratio:1}},'desktop',g);
 const result=resizeSelection({a:{desktop:a},b:{desktop:b}},['a','b'],'desktop','s',0,1,{holdBottom:false});
 const bounds=selectionBounds(Object.values(result));
 near(bounds.top+bounds.height,g.height+1);
});
