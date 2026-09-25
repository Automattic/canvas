import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, dragMovePlacement, dragResizePlacement, snapCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { alignedSiblingGuides } from '../src/sibling-guides.mjs';
const padding = { left: 0, right: 0, top: 0, bottom: 0 };
const g = { ...canvasColumns(960,padding,0,960,0,'desktop'), ...canvasRows(0,0,20,0,32), gap:0 };
const minimum = { columnSpan:1,rowSpan:1 };
const start = mapCanvasPlacement({column:3,columnSpan:3,row:3,rowSpan:3},'desktop',g,minimum);
const sibling = {left:403,top:137,width:123,height:93};

test('nearby edges produce no guide until the destination is aligned',()=>{
 assert.deepEqual(alignedSiblingGuides([{left:100,top:140,width:120,height:80}],[sibling]),[]);
 assert.deepEqual(alignedSiblingGuides([{left:100,top:137,width:120,height:90}],[sibling]),[{axis:'y',position:137,from:100,to:526}]);
});

test('off-grid neighbours do not pull moved or resized blocks off cells',()=>{
 for (const kind of ['move','se']) {
  const raw=kind==='move'?dragMovePlacement(start,'desktop',17,74,minimum):dragResizePlacement(start,'desktop',kind,17,74,minimum);
  const snapped=snapCanvasPlacement(raw,'desktop',minimum,kind==='move'?start:undefined);
  const rect=snapped._rect;
  assert.ok(g.columns.some(t=>Math.abs(t.start-rect.left)<.001));
  assert.ok(g.columns.some(t=>Math.abs(t.end-rect.left-rect.width)<.001));
  assert.ok(g.rows.some(t=>Math.abs(t.start-rect.top)<.001));
  assert.ok(g.rows.some(t=>Math.abs(t.end-rect.top-rect.height)<.001));
  assert.equal(savedCanvasPlacement(snapped).free,undefined);
  assert.deepEqual(alignedSiblingGuides([rect],[sibling]),[]);
  assert.deepEqual(mapCanvasPlacement(savedCanvasPlacement(snapped),'desktop',g,minimum)._rect,rect);
 }
});

test('matching top and bottom edges suppress the redundant centre guide',()=>{
 const neighbour={...start._rect,left:400};
 const guides=alignedSiblingGuides([start._rect],[neighbour]);
 assert.equal(guides.length,2);
 assert.ok(guides.every(guide=>guide.axis==='y'&&guide.from===start._rect.left&&guide.to===520));
});

test('coincident guides merge into one connecting segment',()=>{
 const neighbour={...start._rect,left:400};
 const farther={...start._rect,left:600};
 const guides=alignedSiblingGuides([start._rect],[neighbour,farther]);
 assert.equal(guides.length,2);
 assert.ok(guides.every(guide=>guide.to===720));
});


test('matching left and right edges suppress the redundant centre guide',()=>{
 const rect={left:100,top:100,width:120,height:80};
 assert.deepEqual(alignedSiblingGuides([rect],[{...rect,top:300}]),[
  {axis:'x',position:100,from:100,to:380},
  {axis:'x',position:220,from:100,to:380},
 ]);
});

test('different-sized siblings retain centre guides on either axis',()=>{
 const rect={left:100,top:100,width:120,height:80};
 assert.deepEqual(alignedSiblingGuides([rect],[{left:120,top:300,width:80,height:80}]),[
  {axis:'x',position:160,from:100,to:380},
 ]);
 assert.deepEqual(alignedSiblingGuides([rect],[{left:400,top:120,width:120,height:40}]),[
  {axis:'y',position:140,from:100,to:520},
 ]);
});

test('redundant centres for one sibling do not hide useful centres for another',()=>{
 const rect={left:100,top:100,width:120,height:80};
 const guides=alignedSiblingGuides([rect],[{...rect,left:300},{left:500,top:120,width:100,height:40}]);
 assert.equal(guides.length,3);
 assert.ok(guides.some(guide=>guide.axis==='y'&&guide.position===140&&guide.to===600));
});

test('all edge and centre combinations produce guides on both axes',()=>{
 for (const axis of ['x','y']) for (const edge of [0,.5,1]) for (const target of [0,.5,1]) {
  const rect={left:100,top:100,width:120,height:80};
  const neighbour={left:500,top:500,width:170,height:110};
  const startKey=axis==='x'?'left':'top';
  const sizeKey=axis==='x'?'width':'height';
  const position=rect[startKey]+rect[sizeKey]*edge;
  neighbour[startKey]=position-neighbour[sizeKey]*target;
  const guides=alignedSiblingGuides([rect],[neighbour]);
  assert.ok(guides.some(guide=>guide.axis===axis&&guide.position===position),`${axis}: ${edge} to ${target}`);
 }
});

test('dragged top aligned to two neighbours centres draws one connecting guide',()=>{
 const rect={left:200,top:200,width:100,height:200};
 const neighbours=[{left:0,top:100,width:100,height:200},{left:400,top:100,width:100,height:200}];
 const guides=alignedSiblingGuides([rect],neighbours);
 assert.ok(guides.some(guide=>guide.axis==='y'&&guide.position===200&&guide.from===0&&guide.to===500));
});

test('nearby edge-to-centre alignment does not produce a guide',()=>{
 const rect={left:200,top:203,width:100,height:160};
 assert.deepEqual(alignedSiblingGuides([rect],[{left:0,top:100,width:100,height:200}]),[]);
});

test('mixed selections only contribute unrotated drop rectangles',async()=>{
 const {siblingGuideRectangles}=await import('../src/sibling-guides.mjs');
 const a={left:100,top:100,width:120,height:80};
 const b={left:300,top:100,width:120,height:80};
 const preview={dropPlacements:{a:{_rect:a,rotation:45},b:{_rect:b,rotation:0}}};
 assert.deepEqual(siblingGuideRectangles(preview),[b]);
 assert.deepEqual(alignedSiblingGuides(siblingGuideRectangles(preview),[{...a,left:500}]),[
  {axis:'y',position:100,from:300,to:620},
  {axis:'y',position:180,from:300,to:620},
 ]);
});

test('touch transforms use current drop rotation and restore guides when straight',async()=>{
 const {siblingGuideRectangles}=await import('../src/sibling-guides.mjs');
 const rect={left:100,top:100,width:120,height:80};
 const preview={transforming:true,placement:{rotation:0},dropPlacement:{_rect:rect,rotation:30}};
 assert.deepEqual(siblingGuideRectangles(preview),[]);
 assert.deepEqual(siblingGuideRectangles({...preview,dropPlacement:{_rect:rect,rotation:0}}),[rect]);
 assert.deepEqual(siblingGuideRectangles({...preview,rotating:true}),[]);
 assert.deepEqual(siblingGuideRectangles({...preview,replacing:true}),[]);
});
