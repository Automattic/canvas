import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainReadableResize } from '../src/readable-resize.mjs';
import { canResizeReadableContent } from '../src/automatic-content.mjs';
import { canvasColumns, canvasRows, dragResizePlacement, mapCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';

const minimum = {columnSpan:1,rowSpan:1};
const g = {...canvasColumns(800,{top:17,bottom:0,left:0,right:0},0,800,6,'desktop'),...canvasRows(17,0,30,6,20),gap:6};
const start = mapCanvasPlacement({column:2,columnSpan:8,row:5,rowSpan:8},'desktop',g);
const snap = p => snapCanvasPlacement(p,'desktop',minimum,undefined,6);
function resize(kind,dx,dy,measure,center=false) {
  return constrainReadableResize(t=>dragResizePlacement(start,'desktop',kind,dx*t,dy*t,minimum,undefined,center),
    p=>snapCanvasPlacement(p,'desktop',minimum,undefined,6,center?start._rect:undefined),measure);
}

test('vertical preview and release stop at the smallest content row from either edge',()=>{
 for(const kind of ['n','s']) {
  const next=resize(kind,0,kind==='n'?300:-300,()=>90);
  assert.ok(next._rect.height>=98-.01);
  assert.ok(next._rect.height<99);
  assert.ok(snap(next)._rect.height>=98-.01);
  const fixed=p=>kind==='n'?p._rect.top+p._rect.height:p._rect.top;
  assert.ok(Math.abs(fixed(next)-fixed(start))<1e-6);
 }
});

test('content can shrink below its starting frame and expand freely',()=>{
 const smaller=resize('s',0,-50,()=>20);
 assert.ok(Math.abs(smaller._rect.height-(start._rect.height-50))<1e-6);
 const larger=resize('s',0,50,()=>90);
 assert.ok(Math.abs(larger._rect.height-(start._rect.height+50))<1e-6);
});

test('corner resizing remeasures wrapping at preview and snapped widths',()=>{
 const measure=width=>width<start._rect.width-30?250:90;
 const next=resize('se',-100,-150,measure);
 assert.ok(next._rect.height>=measure(next._rect.width));
 const drop=snap(next);
 assert.ok(drop._rect.height>=measure(drop._rect.width));
});

test('center resizing retains its center while enforcing content height',()=>{
 const next=resize('s',0,-200,()=>90,true);
 assert.ok(next._rect.height>=98-.01);
 assert.ok(Math.abs(next._rect.top+next._rect.height/2-start._rect.top-start._rect.height/2)<1e-6);
});

test('images and fitted text remain exempt from content resize limits',()=>{
 const element=(image,area,width)=>({classList:{contains:name=>image&&name==='canvas__image'},getAttribute:()=>area?'true':null,matches:()=>false,querySelector:()=>({classList:{contains:()=>width}})});
 assert.equal(canResizeReadableContent(element(false,false,false)),true);
 for(const args of [[true,false,false],[false,true,false],[false,false,true]]) assert.equal(canResizeReadableContent(element(...args)),false);
});

test('a completely blocked resize retains its original placement',()=>{
 const small=mapCanvasPlacement({column:2,columnSpan:8,row:5,rowSpan:4},'desktop',g);
 const result=constrainReadableResize(t=>t===0?small:dragResizePlacement(small,'desktop','s',0,-200*t,minimum),snap,()=>98);
 assert.equal(result,small);
});
