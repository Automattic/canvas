import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement, dragMovePlacement, dragResizePlacement, snapCanvasPlacement, centerCanvasPlacement, savedCanvasPlacement, occupiedRows } from '../src/canvas-geometry.mjs';
import { normalizePlacement, minimumSpans } from '../src/placement.mjs';
import { serializePlacement } from '../src/serialization.mjs';
import { preserveRowsOnResize, resizeCanvasRows } from '../src/row-resize.mjs';
import { insetFrame } from '../src/frame-gap.mjs';

const near = (a,b) => assert.ok(Math.abs(a-b)<.01, `${a} != ${b}`);
const same = (a,b) => { for (const key of ['left','top','width','height']) near(a[key],b[key]); };
const geometry = (mode, rows=12, pad=0, width=1000) => {
  const padding={left:31,right:53,top:pad,bottom:pad+17};
  return {...canvasColumns(width,padding,80,width-80,12,mode),...canvasRows(pad,pad+17,rows,12),gap:12};
};

test('removed pinning metadata is ignored and omitted without mutating input',()=>{
  const source={column:3,row:4,columnSpan:4,rowSpan:3,gridColumns:24,
    anchorOffsets:{right:3,bottom:2},anchors:{left:'wide',top:'canvas',bottom:'after:2'},
    free:{x:.2,y:3,width:.2,ratio:1.5,anchorY:'bottom'}};
  const before=structuredClone(source);
  for(const value of [normalizePlacement(source),serializePlacement(source)]) {
    assert.equal(value.anchorOffsets,undefined);
    assert.equal(value.free.anchorY,undefined);
    assert.equal(value.anchors.left,'wide');
    assert.equal(value.anchors.top,undefined);
    assert.equal(value.anchors.bottom,undefined);
  }
  assert.deepEqual(source,before);
});

for(const mode of ['desktop','tablet','mobile']) for(const name of ['core/image','core/paragraph','core/buttons']) {
  test(`${mode} ${name}: bottom and center placement stay fixed after ordinary row growth and reload`,()=>{
    for(const pad of [0,37,61]) {
      const g=geometry(mode,12,pad),minimum=minimumSpans(name);
      const start=mapCanvasPlacement({column:3,row:3,columnSpan:4,rowSpan:4},mode,g,minimum);
      for(const drop of [
        snapCanvasPlacement(dragMovePlacement(start,mode,0,g.height-start._rect.top-start._rect.height,minimum),mode,minimum,start),
        snapCanvasPlacement(dragResizePlacement(start,mode,'s',0,g.height-start._rect.top-start._rect.height,minimum),mode,minimum),
        centerCanvasPlacement(start,mode,'vertical',minimum),
      ]) {
        assert.ok(occupiedRows(drop)<=12);
        if (Math.abs(drop._rect.top+drop._rect.height/2-g.height/2)<.01) near(drop._rect.height,start._rect.height);
        const saved=serializePlacement(drop),before=structuredClone(saved);
        assert.ok(occupiedRows(saved)<=12, 'padding frames must not author extra section rows');
        assert.equal(saved.free?.anchorY,undefined);
        for(const side of ['top','bottom']) assert.equal(saved.anchors?.[side],undefined);
        const layouts={item:{[mode]:drop}};
        const resized=resizeCanvasRows(layouts,mode,12,occupiedRows(drop),6);
        assert.equal(resized.rows,18);
        assert.deepEqual(preserveRowsOnResize(layouts,mode,0,resized.rows),{});
        for(const rows of [18,30,12]) {
          const next=mapCanvasPlacement(saved,mode,geometry(mode,rows,pad),minimum);
          same(next._rect,drop._rect);
        }
        assert.deepEqual(saved,before);
      }
    }
  });
}

test('precise vertical frames retain wide and mixed horizontal boundaries across viewport widths',()=>{
  for(const anchors of [{left:'wide',right:'wide'},{left:'wide',right:12},{left:12,right:'canvas'},{left:'padding',right:'padding'}]) {
    const g=geometry('desktop',12,37,1400);
    const start=mapCanvasPlacement({column:1,row:2,columnSpan:12,rowSpan:3,gridColumns:24,anchors},'desktop',g);
    const drop=snapCanvasPlacement(dragResizePlacement(start,'desktop','s',0,g.height-start._rect.top-start._rect.height, minimumSpans()), 'desktop');
    const saved=serializePlacement(drop);
    for(const side of ['left','right']) if(typeof anchors[side]==='string') assert.equal(saved.anchors[side],anchors[side]);
    for(const width of [320,390,782,1440,2560,3840]) {
      const target=geometry('desktop',20,37,width);
      const p=mapCanvasPlacement(saved,'desktop',target);
      const horizontal=mapCanvasPlacement({...saved,free:undefined,anchors:{left:saved.anchors.left,right:saved.anchors.right}},'desktop',target);
      near(p._rect.left,horizontal._rect.left);near(p._rect.width,horizontal._rect.width);
      near(p._rect.top,drop._rect.top);
    }
  }
});

test('Gap preserves horizontal boundaries while every vertical frame insets symmetrically',()=>{
  const rect={left:100,top:150,width:400,height:200};
  for(const anchors of [{},{left:'wide'},{right:'canvas'},{left:'wide',right:'wide'}]) {
    for(const gap of [0,24,48]) {
      const p=insetFrame({_rect:rect,anchors},{x:gap,y:gap});
      near(p.top,rect.top+gap/2);near(p.height,rect.height-gap);
      if(anchors.left) near(p.left,rect.left);
      if(anchors.right) near(p.left+p.width,rect.left+rect.width);
    }
  }
});

 test('a precise frame with one named horizontal boundary preserves its exact width',()=>{
  for(const anchors of [{left:'wide'},{right:'canvas'}]) for(const width of [320,1440,3840]) {
    const g=geometry('desktop',30,37,width);
    const free={x:.123,y:3,width:.371,ratio:1.7};
    const p=mapCanvasPlacement({column:3,row:4,columnSpan:8,rowSpan:4,gridColumns:24,anchors,free},'desktop',g);
    near(p._rect.width,width*free.width);
    near(p._rect.height,width*free.width/free.ratio);
    if(anchors.left) near(p._rect.left,g.wideStart);
    if(anchors.right) near(p._rect.left+p._rect.width,width);
    same(mapCanvasPlacement(serializePlacement(p),'desktop',g)._rect,p._rect);
  }
});

test('repeated precise image drops at bottom do not inflate the saved section footprint',()=>{
  const g=geometry('desktop',12,37),minimum=minimumSpans('core/image');
  let start=mapCanvasPlacement({column:3,row:3,columnSpan:4,rowSpan:4,free:{x:.2,y:3,width:.23,ratio:1.7},frameRatio:1.7},'desktop',g,minimum);
  for(let i=0;i<10;i++) {
    const preview=dragMovePlacement(start,'desktop',0,g.height-start._rect.top-start._rect.height,minimum);
    const dropped=snapCanvasPlacement(preview,'desktop',minimum,start);
    near(dropped._rect.top+dropped._rect.height,g.height);
    if(i) { near(dropped._rect.width,start._rect.width);near(dropped._rect.height,start._rect.height); }
    assert.ok(g.rows.some(row=>Math.abs(row.start-dropped._rect.top)<.01));
    const saved=serializePlacement(dropped);
    assert.ok(occupiedRows(saved)<=12);
    start=mapCanvasPlacement(saved,'desktop',g,minimum);
    near(start._rect.top+start._rect.height,g.height);
  }
});
