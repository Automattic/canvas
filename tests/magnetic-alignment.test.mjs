import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, alignFreeCanvasPlacement } from '../src/canvas-geometry.mjs';
import { alignedSiblingGuides } from '../src/sibling-guides.mjs';
import { serializePlacement } from '../src/serialization.mjs';
const g = { ...canvasColumns(1000,{left:0,right:0,top:0,bottom:0},100,900,0,'desktop'), ...canvasRows(0,0,20,0,32), gap:0 };
const frame = (left,top,width,height,extra={}) => mapCanvasPlacement({free:{x:left/1000,y:top/32,width:width/1000,ratio:width/height},...extra},'desktop',g);
const close = (a,b) => assert.ok(Math.abs(a-b)<.001, `${a} != ${b}`);
const sibling = {left:407,top:187,width:120,height:110};

test('freeform moves catch sibling guides within eight pixels and preserve dimensions',()=>{
 const value=frame(200,181,200,100);
 const next=alignFreeCanvasPlacement(value,'desktop',{siblings:[sibling]});
 close(next._rect.left,207); close(next._rect.top,187);
 close(next._rect.width,200);close(next._rect.height,100);
 assert.ok(alignedSiblingGuides([next._rect],[sibling]).length>=2);
 const reopened=mapCanvasPlacement(serializePlacement(next),'desktop',g);
 for(const key of ['left','top','width','height'])close(reopened._rect[key],next._rect[key]);
});

test('resizing only catches the manipulated edge and preserves the opposite edge',()=>{
 for(const [kind,value,target] of [
  ['e',frame(200,180,200,100),{left:407,top:77,width:93,height:70}],
  ['w',frame(201,180,200,100),{left:194,top:77,width:93,height:70}],
  ['s',frame(200,180,200,100),{left:77,top:287,width:93,height:70}],
  ['n',frame(200,181,200,100),{left:77,top:174,width:93,height:70}],
 ]){
  const next=alignFreeCanvasPlacement(value,'desktop',{kind,siblings:[target]});
  const r=next._rect,b=value._rect;
  if(kind==='e'){close(r.left+r.width,407);close(r.left,b.left);}
  if(kind==='w'){close(r.left,194);close(r.left+r.width,b.left+b.width);}
  if(kind==='s'){close(r.top+r.height,287);close(r.top,b.top);}
  if(kind==='n'){close(r.top,174);close(r.top+r.height,b.top+b.height);}
  if(/[ew]/.test(kind)){close(r.top,b.top);close(r.height,b.height);}
  else {close(r.left,b.left);close(r.width,b.width);}
 }
});

test('parent center catches without attracting to wide or canvas edges',()=>{
 const value=frame(201,100,292,100);
 close(alignFreeCanvasPlacement(value,'desktop',{kind:'e'})._rect.width,299);
 const far=frame(201,100,289,100);
 assert.equal(alignFreeCanvasPlacement(far,'desktop',{kind:'e'}),far);
 const wide=frame(107,100,200,100);
 assert.equal(alignFreeCanvasPlacement(wide,'desktop'),wide);
 const edge=frame(3,100,200,100);
 assert.equal(alignFreeCanvasPlacement(edge,'desktop'),edge);
});

test('nearest target wins and screen-scaled tolerance is respected',()=>{
 const value=frame(200,180,200,100);
 const siblings=[{left:406,top:70,width:50,height:50},{left:397,top:70,width:50,height:50}];
 close(alignFreeCanvasPlacement(value,'desktop',{kind:'e',siblings})._rect.width,197);
 const target=[{left:415,top:70,width:50,height:50}];
 assert.equal(alignFreeCanvasPlacement(value,'desktop',{kind:'e',siblings:target}),value);
 close(alignFreeCanvasPlacement(value,'desktop',{kind:'e',siblings:target,tolerance:16})._rect.width,215);
});

test('ratio and center resizing retain their constraints while aligning',()=>{
 const value=frame(200,180,200,100);
 for(const fromCenter of [false,true]){
  const next=alignFreeCanvasPlacement(value,'desktop',{kind:'se',siblings:[{left:407,top:70,width:50,height:50}],ratio:2,fromCenter});
  close(next._rect.left+next._rect.width,407);
  close(next._rect.width/next._rect.height,2);
  if(fromCenter){close(next._rect.left+next._rect.width/2,300);close(next._rect.top+next._rect.height/2,230);}
  else {close(next._rect.left,200);close(next._rect.top,180);}
 }
});

test('rotated frames do not claim unrotated guide alignment',()=>{
 const value=frame(200,180,200,100,{rotation:15});
 assert.equal(alignFreeCanvasPlacement(value,'desktop',{kind:'e',siblings:[sibling]}),value);
});
