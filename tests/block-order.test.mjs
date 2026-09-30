import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderBlocks, preserveReorderedLayout } from '../src/block-order.mjs';
import { resolveCanvasLayouts, paintLayers } from '../src/canvas-groups.mjs';
import { canvasColumns, canvasRows } from '../src/canvas-geometry.mjs';
const leaf = (id, canvas = {}) => ({clientId:id,name:'core/paragraph',attributes:{canvas},innerBlocks:[]});
const ids = blocks => blocks.map(b => b.clientId);
const apply = (blocks, updates) => blocks.map(block => ({...block,attributes:{...block.attributes,...updates[block.clientId]},innerBlocks:apply(block.innerBlocks,updates)}));

test('front/back move selected siblings together in source order, without changing attributes', () => {
 const blocks = ['a','b','c','d'].map(id => leaf(id));
 const original = structuredClone(blocks);
 const front = reorderBlocks(blocks,['d','b'],1);
 const back = reorderBlocks(blocks,['d','b'],-1);
 assert.deepEqual(ids(front),['a','c','b','d']);
 assert.deepEqual(ids(back),['b','d','a','c']);
 assert.equal(front[2],blocks[1]);
 assert.equal(reorderBlocks(front,['b','d'],1),front);
 assert.equal(reorderBlocks(back,['b','d'],-1),back);
 assert.equal(reorderBlocks(blocks,['missing'],1),blocks);
 assert.equal(reorderBlocks(blocks,[],1),blocks);
 assert.equal(reorderBlocks(blocks,ids(blocks),1),blocks);
 assert.deepEqual(blocks,original);
});

test('native reorder changes stacking at all breakpoints while preserving automatic positions through save', () => {
 const blocks = [leaf('a'),leaf('b'),leaf('c')];
 const geometry = Object.fromEntries(['desktop','tablet','mobile'].map(mode=>[mode,{
  ...canvasColumns(1000,{top:24,right:24,bottom:24,left:24},0,1000,12,mode),...canvasRows(24,24,30,12),gap:12,
  automatic:{0:{gridColumns:12,column:1,columnSpan:12,row:1,rowSpan:3},1:{gridColumns:12,column:1,columnSpan:12,row:5,rowSpan:3},2:{gridColumns:12,column:1,columnSpan:12,row:9,rowSpan:3}},
 }]));
 const before = resolveCanvasLayouts(blocks,geometry);
 const reordered = [blocks[2],blocks[0],blocks[1]];
 const updates = preserveReorderedLayout(blocks,reordered);
 const saved = JSON.parse(JSON.stringify(apply(reordered,updates)));
 const after = resolveCanvasLayouts(saved,geometry);
 assert.deepEqual(paintLayers(saved),{c:1,a:2,b:3});
 for(const mode of ['desktop','tablet','mobile']) {
  for(const id of ['a','b','c']) assert.deepEqual(after[id][mode]._rect,before[id][mode]._rect);
  assert.equal(after.c[mode].layer,1);
  assert.equal(after.b[mode].layer,3);
 }
 assert.deepEqual(preserveReorderedLayout(saved,[saved[1],saved[2],saved[0]]),{});
 assert.deepEqual(preserveReorderedLayout(blocks,blocks),{});
 assert.deepEqual(preserveReorderedLayout(blocks,[...blocks,leaf('d')]),{});
 assert.deepEqual(preserveReorderedLayout(blocks,blocks.slice(1)),{});
});

test('child order and group order each define an independent stacking context', () => {
 const group={clientId:'g',name:'core/group',attributes:{canvas:{group:1}},innerBlocks:[leaf('a'),leaf('b')]};
 const roots=[group,leaf('outside')];
 const changed=[{...group,innerBlocks:[group.innerBlocks[1],group.innerBlocks[0]]},roots[1]];
 assert.deepEqual(paintLayers(changed),{g:1,b:1,a:2,outside:2});
 assert.deepEqual(paintLayers(reorderBlocks(changed,['g'],1)),{outside:1,g:2,b:1,a:2});
 assert.deepEqual(Object.keys(preserveReorderedLayout(roots,changed)),['a','b','outside']);
});

test('CSS fallback uses sibling paint order even when automatic layout order differs', async () => {
 const { layoutVariables } = await import('../src/geometry.mjs');
 const roots=[leaf('front',{order:2}),leaf('back',{order:0}),leaf('middle',{order:1})];
 const layouts=resolveCanvasLayouts(roots,{});
 for(const mode of ['desktop','tablet','mobile']) {
  assert.equal(layoutVariables(layouts.front)[`--canvas-${mode}-layer`],1);
  assert.equal(layoutVariables(layouts.back)[`--canvas-${mode}-layer`],2);
  assert.equal(layoutVariables(layouts.middle)[`--canvas-${mode}-layer`],3);
 }
});
