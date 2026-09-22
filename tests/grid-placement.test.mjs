import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, mapCanvasRowsPlacement, centerCanvasPlacement, dragCanvasPlacement, dragMovePlacement, dragResizePlacement, snapCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { normalizePlacement, minimumSpans } from '../src/placement.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { serializePlacement } from '../src/serialization.mjs';
import { assertNearestRowCenter } from './helpers/snapped-placement.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<.01,`${a} != ${b}`);
const same=(a,b)=>{for(const k of ['left','top','width','height'])close(a[k],b[k]);};
function geometry(mode='desktop',rows=20,pad={top:37,bottom:61},width=1200){
 const padding={left:30,right:30,...pad};
 return {...canvasColumns(width,padding,Math.max(30,(width-1480)/2),width-Math.max(30,(width-1480)/2),0,mode),...canvasRows(pad.top,pad.bottom,rows,0,32),gap:0};
}
function onRows(p){const g=p._canvas,r=p._rect;assert.ok(g.rows.some(t=>Math.abs(t.start-r.top)<.01));assert.ok(g.rows.some(t=>Math.abs(t.end-r.top-r.height)<.01));}

test('numeric vertical overrides are omitted and never change placement geometry',()=>{
 for(const mode of ['desktop','tablet','mobile'])for(const anchors of [{top:0},{bottom:19},{top:-2,bottom:40}]){
  const base={column:2,columnSpan:4,row:3,rowSpan:5,anchors:{left:'wide'}};
  const raw={...base,anchors:{...base.anchors,...anchors}};
  assert.deepEqual(normalizePlacement(raw,mode),normalizePlacement(base,mode));
  assert.deepEqual(serializePlacement(raw),serializePlacement(base));
  const g=geometry(mode);same(mapCanvasPlacement(raw,mode,g)._rect,mapCanvasPlacement(base,mode,g)._rect);
 }
});

test('nearest-row centering preserves odd and even spans with unequal padding and wins ties earlier',()=>{
 for(const mode of ['desktop','tablet','mobile'])for(const count of [11,12,19,20])for(const rowSpan of [1,2,3,4,7])for(const pad of [{top:0,bottom:0},{top:37,bottom:61},{top:61,bottom:3}]){
  const g=geometry(mode,count,pad);const before=mapCanvasPlacement({column:2,columnSpan:4,row:2,rowSpan,anchors:{left:'wide'}},mode,g);
  const p=centerCanvasPlacement(before,mode,'vertical');
  assert.equal(p.rowSpan,before.rowSpan);close(p._rect.height,before._rect.height);close(p._rect.left,before._rect.left);close(p._rect.width,before._rect.width);
  assertNearestRowCenter(p);assert.equal(savedCanvasPlacement(p).free,undefined);assert.equal(p._base.anchors.left,'wide');
  same(mapCanvasPlacement(serializePlacement(p),mode,g)._rect,p._rect);same(centerCanvasPlacement(p,mode,'vertical')._rect,p._rect);
 }
});

test('external drops and discrete resize commits agree with pointer-release destinations',()=>{
 const minimum=minimumSpans();
 for(const mode of ['desktop','tablet','mobile']){
  const g=geometry(mode);const start=mapCanvasPlacement({column:3,columnSpan:4,row:3,rowSpan:4},mode,g);
  for(const [kind,dx,dy]of [['move',31,55],['move',0,g.height/2-start._rect.top-start._rect.height/2],['se',51,42],['n',0,-25]]){
   const preview=kind==='move'?dragMovePlacement(start,mode,dx,dy,minimum):dragResizePlacement(start,mode,kind,dx,dy,minimum);
   const released=snapCanvasPlacement(preview,mode,minimum,kind==='move'?start:undefined);
   const discrete=dragCanvasPlacement(start,mode,kind,dx,dy,minimum);
   same(discrete._rect,released._rect);same(mapCanvasPlacement(serializePlacement(discrete),mode,g)._rect,released._rect);onRows(discrete);
  }
 }
});

test('editing inherited image geometry commits cells only in the edited viewport and preserves horizontal references',()=>{
 for(const mode of ['tablet','mobile'])for(const anchors of [{},{left:'wide'},{left:'wide',right:'wide'}]){
  const desktop={column:3,columnSpan:7,row:3,rowSpan:5,gridColumns:24,anchors,frameRatio:1.7};
  const source={clientId:'image',name:'core/image',attributes:{canvas:{desktop}},innerBlocks:[]};
  const geometries={desktop:geometry('desktop'),[mode]:geometry(mode,20,{top:37,bottom:61},mode==='mobile'?390:780)};
  const layout=resolveLayouts([source],geometries).image;
  const p=centerCanvasPlacement(layout[mode],mode,'vertical');onRows(p);assert.equal(p.free,undefined);
  const saved=savePlacement(source.attributes.canvas,layout,mode,p);
  assert.deepEqual(saved.desktop,serializePlacement(desktop));assert.equal(saved[mode].free,undefined);
  for(const key of Object.keys(anchors))assert.equal(saved[mode].anchors[key],anchors[key]);
  const reopened=resolveLayouts([{...source,attributes:{canvas:saved}}],geometries).image[mode];same(reopened._rect,p._rect);
 }
});

test('partial edge frames survive row growth but a later individual edit resolves them to current cells',()=>{
 const g=geometry();const start=mapCanvasRowsPlacement({column:3,columnSpan:4,row:18,rowSpan:3},'desktop',g,minimumSpans(),{bottom:g.height});
 assert.ok(start.free);const saved=serializePlacement(start);const grown=geometry('desktop',30);
 const preserved=mapCanvasPlacement(saved,'desktop',grown);same(preserved._rect,start._rect);
 const edited=centerCanvasPlacement(preserved,'desktop','vertical');onRows(edited);assert.equal(edited.free,undefined);assertNearestRowCenter(edited);
});
