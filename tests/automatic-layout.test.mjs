import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { readablePlacements, automaticCanvasRows } from '../src/automatic-layout.mjs';
const close = (a,b) => assert.ok(Math.abs(a-b)<.001, `${a} != ${b}`);
function geometry() { const padding={left:30,right:30,top:0,bottom:0}; return {mobile:{...canvasColumns(390,padding,30,360,6,'mobile'),...canvasRows(0,0,20,6,8),gap:6}}; }

function readableFixture(specs) {
  const g=geometry(390,[]).mobile;
  const placements=specs.map(spec=>mapCanvasPlacement({gridColumns:8,column:1,columnSpan:8,row:1,rowSpan:1,
    free:{x:spec.left/390,y:spec.top/(g.rowHeight+g.gap),width:spec.width/390,ratio:spec.width/spec.height}},'mobile',g));
  const items=specs.map((spec,index)=>({index,kind:spec.kind||'paragraph',automatic:spec.automatic!==false,source:{},
    sourceLeft:(spec.left-30)/330,sourceRight:(spec.left+spec.width-30)/330,minWidth:spec.minWidth||0,...spec}));
  const changes=readablePlacements(items,'mobile',g,placements,item=>item.measured||item.height);
  return {g,changes,rects:placements.map((p,i)=>changes[i]?mapCanvasPlacement(changes[i],'mobile',g)._rect:p._rect)};
}

test('fitting text and labels preserve their exact fractional frames', () => {
  const {changes}=readableFixture([{left:75.1,top:12.3,width:120.5,height:30.7}]);
  assert.deepEqual(changes,{});
});

test('readable copy grows only as needed and clears following content without moving another column', () => {
  const {rects}=readableFixture([
    {left:30,top:0,width:140,height:25,measured:70},
    {left:30,top:40,width:140,height:25},
    {left:210,top:0,width:140,height:25},
  ]);
  close(rects[0].width,140); close(rects[0].height,70); close(rects[1].top,85); close(rects[2].top,0);
});

test('intentional overlays and manual overrides retain their positions', () => {
  const {rects}=readableFixture([
    {left:30,top:0,width:140,height:100,kind:'image'},
    {left:30,top:20,width:140,height:20,measured:50},
    {left:210,top:20,width:140,height:20,automatic:false,measured:90},
  ]);
  close(rects[0].height,100); close(rects[1].top,20); close(rects[2].height,20);
});

test('only natural minimum content width expands a frame and keeps its center or right edge', () => {
  const {rects}=readableFixture([
    {left:145,top:0,width:100,height:40,minWidth:180,kind:'buttons'},
    {left:260,top:80,width:100,height:40,minWidth:180},
  ]);
  close(rects[0].left+rects[0].width/2,195); close(rects[1].left+rects[1].width,360);
});

test('authored empty rows survive and readable content can add rows up to the limit',()=>{
 assert.equal(automaticCanvasRows(7,12),12); assert.equal(automaticCanvasRows(20,12),20); assert.equal(automaticCanvasRows(600,12),500);
});

test('canvas-edge text keeps its authored width when readable content already fits',()=>{
 const {changes,rects}=readableFixture([{left:0,top:0,width:390,height:40,minWidth:100}]);
 assert.deepEqual(changes,{}); close(rects[0].left,0); close(rects[0].width,390);
});

test('centered controls retain horizontal alignment and grow downward',()=>{
 const height=geometry().mobile.height;
 const {rects}=readableFixture([{left:145,top:(height-20)/2,width:100,height:20,minWidth:180,measured:56,kind:'buttons'}]);
 close(rects[0].left+rects[0].width/2,195); close(rects[0].top,(height-20)/2);
});

test('explicit readable placements grow downward in place and clear content they newly cover', () => {
  const {rects}=readableFixture([
    {left:30,top:0,width:140,height:40,automatic:false,explicitReadable:true,measured:90,minWidth:300},
    {left:30,top:60,width:140,height:20,automatic:false,explicitReadable:true},
    {left:210,top:0,width:140,height:20,automatic:false,explicitReadable:true},
  ]);
  // Authored column, width, and top are kept; only the height grows.
  close(rects[0].left,30); close(rects[0].width,140); close(rects[0].top,0); close(rects[0].height,90);
  // The item below moves just past the grown frame, keeping its authored spacing.
  close(rects[1].top,110);
  // Another column is untouched.
  close(rects[2].top,0);
});

test('explicit readable placements that fit keep their exact frames', () => {
  const {changes}=readableFixture([
    {left:30,top:0,width:140,height:40,automatic:false,explicitReadable:true,measured:30},
    {left:30,top:60,width:140,height:20,automatic:false,explicitReadable:true},
  ]);
  assert.deepEqual(changes,{});
});

test('explicit readable growth preserves authored overlaps', () => {
  const {rects}=readableFixture([
    {left:30,top:0,width:300,height:100,kind:'image',automatic:false,explicitReadable:true},
    {left:60,top:20,width:140,height:30,automatic:false,explicitReadable:true,measured:60},
  ]);
  close(rects[0].top,0); close(rects[0].height,100); close(rects[1].top,20); close(rects[1].height,60);
});

test('explicit fitted text keeps its authored frame', () => {
  const {changes}=readableFixture([
    {left:30,top:0,width:300,height:60,automatic:false,explicitReadable:true,widthFit:true,measured:120},
    {left:30,top:70,width:300,height:20,automatic:false,explicitReadable:true},
  ]);
  assert.deepEqual(changes,{});
});
