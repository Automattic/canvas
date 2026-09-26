import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeBlocks } from '../src/arrange-blocks.mjs';
import { resolveCanvasLayouts, paintLayers } from '../src/canvas-groups.mjs';
import { canvasColumns, canvasRows } from '../src/canvas-geometry.mjs';
import { ATTRIBUTE, COLUMNS } from '../src/placement.mjs';
const geometry = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, {
  ...canvasColumns(1200, {top:24,right:24,bottom:24,left:24}, 100, 1100, 12, mode), ...canvasRows(24,24,24,12), gap:12,
}]));
const leaf = (id,row,column=1) => ({clientId:id,name:'core/paragraph',attributes:{content:id,[ATTRIBUTE]:{desktop:{gridColumns:24,column,columnSpan:5,row,rowSpan:3}}},innerBlocks:[]});
test('arranges reading order and nested groups without changing responsive geometry or paint order',()=>{
 const blocks=[leaf('bottom',20),{clientId:'group',name:'core/group',attributes:{[ATTRIBUTE]:{group:1}},innerBlocks:[leaf('right',1,10),leaf('left',1)]},leaf('middle',10)];
 const before=resolveCanvasLayouts(blocks,geometry);
 const arranged=arrangeBlocks(blocks,before,'desktop');
 assert.deepEqual(arranged.map(b=>b.clientId),['group','middle','bottom']);
 assert.deepEqual(arranged[0].innerBlocks.map(b=>b.clientId),['left','right']);
 const after=resolveCanvasLayouts(arranged,geometry);
 for(const mode of Object.keys(COLUMNS)) {
  for(const id of Object.keys(before)) assert.deepEqual(after[id][mode]._rect,before[id][mode]._rect);
  assert.deepEqual(paintLayers(arranged,after,mode),paintLayers(blocks,before,mode));
 }
 assert.equal(arrangeBlocks(arranged,after,'desktop'),arranged);
 assert.deepEqual(blocks.map(b=>b.clientId),['bottom','group','middle']);
});

test('promotes a nearby heading while preserving geometry and layers at every breakpoint', () => {
 const heading = {...leaf('heading',2),name:'core/heading'};
 const blocks = [leaf('paragraph',1), heading, leaf('later',15)];
 const before = resolveCanvasLayouts(blocks,geometry);
 const arranged = arrangeBlocks(blocks,before,'desktop');
 assert.deepEqual(arranged.map(b=>b.clientId),['heading','paragraph','later']);
 const after = resolveCanvasLayouts(arranged,geometry);
 for (const mode of Object.keys(COLUMNS)) {
  for (const id of Object.keys(before)) assert.deepEqual(after[id][mode]._rect,before[id][mode]._rect);
  assert.deepEqual(paintLayers(arranged,after,mode),paintLayers(blocks,before,mode));
 }
 assert.equal(arrangeBlocks(arranged,after,'desktop'),arranged);
});

test('does not promote headings across distant content, separate columns, or groups', () => {
 for (const preceding of [leaf('earlier',1),leaf('column',9,15),{
  clientId:'group',name:'core/group',attributes:{[ATTRIBUTE]:{group:1}},innerBlocks:[leaf('child',9)]
 }]) {
  const heading = {...leaf('heading',10),name:'core/heading'};
  const blocks = [preceding,heading];
  assert.equal(arrangeBlocks(blocks,resolveCanvasLayouts(blocks,geometry),'desktop'),blocks);
 }
});
