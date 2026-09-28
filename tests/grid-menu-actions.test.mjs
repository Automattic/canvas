import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { gridAlignedPlacement } from '../src/grid-placement.mjs';
import { distributeHorizontally, distributeVertically, equalizeWidths } from '../src/selection-distribution.mjs';
import { alignSelection, positionSelection } from '../src/selection-alignment.mjs';
import { exactPlacement, sourcePlacement, resolveCanvasLayouts } from '../src/canvas-groups.mjs';
import { savePlacement } from '../src/geometry.mjs';
import { minimumSpans } from '../src/placement.mjs';

const close = (a, b, message = '') => assert.ok(Math.abs(a-b)<.003, `${message}: ${a} != ${b}`);
const near = (a,b) => Math.abs(a-b)<.003;
function fixture(mode, gap=10, overlap=false, count=mode==='desktop'?24:12) {
  const padding = {left:40,right:40,top:0,bottom:0};
  const g = {...canvasColumns(1200,padding,40,1160,gap,mode,count), ...canvasRows(0,0,30,gap),gap};
  const blocks = [0,1,2].map(i=>({clientId:String(i),name:'core/image',attributes:{canvas:{}},innerBlocks:[]}));
  const layouts = Object.fromEntries(blocks.map((b,i)=> {
    const p=mapCanvasPlacement({column:1+(overlap?i:i*Math.floor(count*.3)),columnSpan:Math.floor(count/6)+i,row:1+(overlap?i:i*8),rowSpan:3+i,gridColumns:count,frameRatio:1},mode,g);
    return [b.clientId,{desktop:p,[mode]:p,image:true}];
  }));
  return {g,blocks,layouts,ids:blocks.map(b=>b.clientId)};
}
function savedResult(result, blocks, layouts, mode, cells = true) {
  return Object.fromEntries(blocks.map(b=>{
    const p=cells ? gridAlignedPlacement(result[b.clientId],mode,minimumSpans(b.name)) : result[b.clientId];
    const saved=savePlacement(b.attributes.canvas,layouts[b.clientId],mode,p,minimumSpans(b.name));
    const restored=mapCanvasPlacement(saved[mode],mode,p._canvas,minimumSpans(b.name));
    for(const key of ['left','top','width','height']) close(restored._rect[key],p._rect[key],key);
    const r=restored._rect,g=p._canvas;
    if(cells) for(const [tracks,edge,value] of [[g.columns,'start',r.left],[g.columns,'end',r.left+r.width],[g.rows,'start',r.top],[g.rows,'end',r.top+r.height]]) assert.ok(tracks.some(t=>near(t[edge],value)),`${edge}=${value} off cells`);
    return [b.clientId,{...layouts[b.clientId],[mode]:restored}];
  }));
}
function unchanged(a,b) { for(const id of Object.keys(a)) for(const key of ['left','top','width','height']) close(a[id]._rect[key],b[id]._rect[key],`repeat ${key}`); }

for(const mode of ['desktop','tablet','mobile']) for(const gap of [0,10,24]) {
  for(const overlap of [false,true]) for(const axis of ['horizontal','vertical']) test(`Grid ${axis} distribution has exact saved gaps, stable bounds, and repeats: ${mode}, gap=${gap}, overlap=${overlap}`,()=>{
    const {blocks,layouts,ids}=fixture(mode,gap,overlap);
    const run=axis==='horizontal'?distributeHorizontally:distributeVertically;
    const position=axis==='horizontal'?'left':'top',size=axis==='horizontal'?'width':'height';
    const result=run(blocks,layouts,mode);
    assert.ok(result);
    const reopened=savedResult(result,blocks,layouts,mode,false);
    const rects=ids.map(id=>reopened[id][mode]._rect).sort((a,b)=>a[position]-b[position]);
    close(rects[0][position],Math.min(...ids.map(id=>layouts[id][mode]._rect[position])));
    close(rects.at(-1)[position]+rects.at(-1)[size],Math.max(...ids.map(id=>layouts[id][mode]._rect[position]+layouts[id][mode]._rect[size])));
    const gaps=rects.slice(1).map((r,i)=>r[position]-rects[i][position]-rects[i][size]);
    gaps.forEach(value=>close(value,gaps[0],'equal gap'));
    for(const id of ids) for(const key of ['width','height']) close(result[id]._rect[key],layouts[id][mode]._rect[key],'preserved size');
    for(const id of ids) for(const key of axis==='horizontal'?['top','height']:['left','width']) close(result[id]._rect[key],layouts[id][mode]._rect[key],'untouched axis');
    unchanged(result,run(blocks,reopened,mode));
  });
  for(const alignment of ['left','horizontal','right','top','vertical','bottom']) test(`Grid ${alignment} alignment is exact after saving and repeats: ${mode}, gap=${gap}`,()=>{
    const {blocks,layouts,ids}=fixture(mode,gap);
    const result=alignSelection(layouts,ids,mode,alignment);
    const reopened=savedResult(result,blocks,layouts,mode);
    const horizontal=['left','horizontal','right'].includes(alignment),position=horizontal?'left':'top',size=horizontal?'width':'height';
    const fraction=['horizontal','vertical'].includes(alignment)?.5:['right','bottom'].includes(alignment)?1:0;
    const points=ids.map(id=>reopened[id][mode]._rect[position]+reopened[id][mode]._rect[size]*fraction);
    points.forEach(value=>close(value,points[0],'aligned'));
    unchanged(result,alignSelection(reopened,ids,mode,alignment));
  });
  for(const axis of ['both','horizontal','vertical']) for(const single of [false,true]) test(`Grid ${axis} position centers ${single?'single':'multiple'} frames after saving: ${mode}, gap=${gap}`,()=>{
    const {blocks,layouts,ids}=fixture(mode,gap);
    const selected=single?[ids[0]]:ids, selectedBlocks=blocks.filter(b=>selected.includes(b.clientId));
    const {placements,rows}=positionSelection(layouts,selected,mode,axis);
    const reopened=savedResult(placements,selectedBlocks,layouts,mode);
    const g=placements[selected[0]]._canvas;
    for(const [direction,position,size,center] of [['horizontal','left','width',g.center],['vertical','top','height',g.height/2]]) if(axis==='both'||axis===direction) {
      const low=Math.min(...selected.map(id=>reopened[id][mode]._rect[position]));
      const high=Math.max(...selected.map(id=>reopened[id][mode]._rect[position]+reopened[id][mode]._rect[size]));
      close((low+high)/2,center,'center');
    }
    const again=positionSelection(reopened,selected,mode,axis);
    assert.equal(again.rows,rows);
    unchanged(placements,again.placements);
  });
}

test('Equalize widths gives five identical two-cell frames in twelve columns, and exact Freeform widths',()=>{
  for(const cells of [true,false]) {
    const {g}=fixture('desktop',10,false,12);
    const blocks=Array.from({length:5},(_,i)=>({clientId:String(i),name:'core/image',attributes:{}}));
    const layouts=Object.fromEntries(blocks.map((b,i)=>[b.clientId,{desktop:mapCanvasPlacement({column:i+1,columnSpan:i+1,row:i+1,rowSpan:3,gridColumns:12},'desktop',g)}]));
    const result=equalizeWidths(blocks,layouts,'desktop',{cells});
    const values=Object.values(result);
    values.forEach(p=>close(p._rect.width,values[0]._rect.width));
    if(cells) savedResult(result,blocks,layouts,'desktop');
    unchanged(result,equalizeWidths(blocks,Object.fromEntries(Object.entries(result).map(([id,p])=>[id,{desktop:p}])),'desktop',{cells}));
  }
});

test('Grid normalization preserves clipped outer rows and removes off-cell named anchors',()=>{
  const padding={left:37,right:21,top:60,bottom:17};
  const g={...canvasColumns(1000,padding,55,940,10,'desktop'),...canvasRows(60,17,12,10),gap:10};
  const source=exactPlacement({left:55,top:0,width:300,height:g.rows[2].end},'desktop',g,{anchors:{left:'wide'}});
  const p=gridAlignedPlacement(source,'desktop');
  close(p._rect.top,0);
  close(p._rect.height,g.rows[2].end);
  savedResult({a:p},[{clientId:'a',name:'core/image',attributes:{}}],{a:{desktop:source}},'desktop');
});

test('Grid alignment of a child in a translated group saves the displayed cells',()=>{
  const {g,blocks}=fixture('desktop');
  blocks[0].attributes.canvas={desktop:{column:2,columnSpan:5,row:3,rowSpan:4,gridColumns:24}};
  const group={clientId:'group',name:'core/group',attributes:{canvas:{group:1,offset:{desktop:{x:.023,y:.4}}}},innerBlocks:[blocks[0]]};
  const layouts=resolveCanvasLayouts([group],{desktop:g});
  const {placements}=positionSelection(layouts,['0'],'desktop','horizontal');
  const displayed=gridAlignedPlacement(placements['0'],'desktop');
  const source=sourcePlacement(displayed,'desktop',layouts['0'].desktop);
  group.innerBlocks[0].attributes.canvas=savePlacement(blocks[0].attributes.canvas,layouts['0'],'desktop',source);
  const reopened=resolveCanvasLayouts([group],{desktop:g})['0'].desktop;
  for(const key of ['left','top','width','height']) close(displayed._rect[key],reopened._rect[key]);
});

test('Distribution preserves overlapping button frames and the existing rows',()=>{
  for(const mode of ['desktop','tablet','mobile']) {
    const {g}=fixture(mode,10,false,12);
    const blocks=[0,1,2].map(i=>({clientId:String(i),name:'core/buttons',attributes:{}}));
    const small={...g,...canvasRows(0,0,2,10)};
    const layouts=Object.fromEntries(blocks.map(b=>[b.clientId,{desktop:mapCanvasPlacement({column:1,columnSpan:4,row:1,rowSpan:2,gridColumns:12},mode,small,minimumSpans(b.name)),[mode]:mapCanvasPlacement({column:1,columnSpan:4,row:1,rowSpan:2,gridColumns:12},mode,small,minimumSpans(b.name))}]));
    const vertical=distributeVertically(blocks,layouts,mode);
    assert.equal(vertical['0']._canvas.coreRows,2);
    const reopened=savedResult(vertical,blocks,layouts,mode,false);
    unchanged(vertical,distributeVertically(blocks,reopened,mode));
    const horizontal=distributeHorizontally(blocks,layouts,mode);
    Object.values(horizontal).forEach(p=>assert.equal(p.columnSpan,4));
    savedResult(horizontal,blocks,layouts,mode);
  }
});

test('Unsupported distributions remain unavailable for a single block, groups, and impossible minimums',()=>{
 const {g,blocks,layouts}=fixture('desktop',10,false,12);
 for(const run of [equalizeWidths,distributeHorizontally,distributeVertically]) {
   assert.equal(run([blocks[0]],layouts,'desktop'),null);
   assert.equal(run([{...blocks[0],name:'core/group',attributes:{canvas:{group:1}}},blocks[1]],layouts,'desktop'),null);
 }
 const buttons=Array.from({length:10},(_,i)=>({clientId:String(i),name:'core/buttons',attributes:{}}));
 const positions=Object.fromEntries(buttons.map(b=>[b.clientId,{desktop:mapCanvasPlacement({column:1,columnSpan:4,row:1,rowSpan:2,gridColumns:12},'desktop',g)}]));
 assert.ok(distributeHorizontally(buttons,positions,'desktop'));
 assert.equal(equalizeWidths(buttons,positions,'desktop'),null);
});

test('Aligning children to a Canvas edge does not reapply a group offset on reload',()=>{
 const padding={left:0,right:0,top:0,bottom:0};
 const g={...canvasColumns(1200,padding,0,1200,10,'desktop'),...canvasRows(0,0,20,10),gap:10};
 const items=[0,1].map(i=>({clientId:String(i),name:'core/heading',attributes:{canvas:{desktop:{column:i*7+1,columnSpan:4,row:3+i*3,rowSpan:3,gridColumns:24}}},innerBlocks:[]}));
 const group={clientId:'group',name:'core/group',attributes:{canvas:{group:1,offset:{desktop:{x:-.02,y:0}}}},innerBlocks:items};
 const layouts=resolveCanvasLayouts([group],{desktop:g});
 const result=alignSelection(layouts,['0','1'],'desktop','left');
 for(const b of items) b.attributes.canvas=savePlacement(b.attributes.canvas,layouts[b.clientId],'desktop',sourcePlacement(result[b.clientId],'desktop',layouts[b.clientId].desktop));
 const reopened=resolveCanvasLayouts([group],{desktop:g});
 for(const id of ['0','1']) for(const key of ['left','top','width','height']) close(result[id]._rect[key],reopened[id].desktop._rect[key]);
});


test('Canvas edges in a clipped padding gap remain attached when normalizing Grid frames',()=>{
 const padding={left:37,right:21,top:43,bottom:17};
 const g={...canvasColumns(1000,padding,55,940,10,'desktop'),...canvasRows(43,17,12,10),gap:10};
 const source=exactPlacement({left:0,top:0,width:g.width,height:g.height},'desktop',g,{fillHeight:true,anchors:{left:'canvas',right:'canvas'}});
 const p=gridAlignedPlacement(source,'desktop');
 close(p._rect.top,0);close(p._rect.height,g.height);
 assert.equal(p.fillHeight,true);
 savedResult({a:p},[{clientId:'a',name:'core/image',attributes:{}}],{a:{desktop:source}},'desktop');
});
