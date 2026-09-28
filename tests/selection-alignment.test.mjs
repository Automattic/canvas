import test from 'node:test';
import assert from 'node:assert/strict';
import { positionSelection, alignSelection } from '../src/selection-alignment.mjs';
import { selectionBounds } from '../src/selection-resize.mjs';
import { exactPlacement } from '../src/canvas-groups.mjs';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { gridAlignedPlacement } from '../src/grid-placement.mjs';
import { savePlacement } from '../src/geometry.mjs';
import { minimumSpans } from '../src/placement.mjs';
const close = (a,b) => assert.ok(Math.abs(a-b)<.02, `${a} != ${b}`);
const ids = ['a','b','c'];
function fixture(mode, rotated = false) {
  const g = { ...canvasColumns(1200, {left:0,right:0,top:0,bottom:0}, 0,1200,10,mode,24), ...canvasRows(0,0,30,10), gap:10, viewport:mode, referenceWidth:1260 };
  const rects = [{left:40,top:100,width:150,height:80},{left:300,top:200,width:90,height:120},{left:450,top:350,width:110,height:100}];
  const layouts = Object.fromEntries(ids.map((id,i) => {
    const p = exactPlacement(rects[i],mode,g,{rotation:rotated ? i*25 : 0});
    return [id,{desktop:p,[mode]:p}];
  }));
  return {g,layouts};
}
function checkSaved(result, layouts, mode, g, cells) {
  for (const id of ids) {
    const p = cells ? gridAlignedPlacement(result[id],mode,minimumSpans('core/image')) : result[id];
    const saved = savePlacement({},layouts[id],mode,p);
    const restored = mapCanvasPlacement(saved[mode],mode,g);
    if (cells) assert.equal(saved[mode].free, undefined);
    for (const key of ['left','top','width','height']) close(restored._rect[key],p._rect[key]);
  }
}
for (const mode of ['desktop','tablet','mobile']) for (const cells of [false]) {
  for (const axis of ['both','horizontal','vertical']) test(`position composition ${mode} cells=${cells} ${axis}`, () => {
    const {g,layouts} = fixture(mode);
    const {placements,rows} = positionSelection(layouts,ids,mode,axis,{cells});
    assert.equal(rows,g.coreRows);
    const delta = { x:placements.a._rect.left-layouts.a[mode]._rect.left,y:placements.a._rect.top-layouts.a[mode]._rect.top };
    for (const id of ids) {
      close(placements[id]._rect.left-layouts[id][mode]._rect.left,delta.x);
      close(placements[id]._rect.top-layouts[id][mode]._rect.top,delta.y);
      close(placements[id]._rect.width,layouts[id][mode]._rect.width);
      close(placements[id]._rect.height,layouts[id][mode]._rect.height);
    }
    if (axis==='horizontal') close(delta.y,0);
    if (axis==='vertical') close(delta.x,0);
    if (!cells) {
      const b = selectionBounds(Object.values(placements));
      if (axis!=='vertical') close(b.left+b.width/2,g.center??g.width/2);
      if (axis!=='horizontal') close(b.top+b.height/2,g.height/2);
    }
    checkSaved(placements,layouts,mode,g,cells);
    const again = positionSelection(Object.fromEntries(ids.map(id=>[id,{[mode]:placements[id]}])),ids,mode,axis,{cells});
    for (const id of ids) for (const key of ['left','top','width','height']) close(again.placements[id]._rect[key],placements[id]._rect[key]);
  });
  for (const alignment of ['left','horizontal','right','top','vertical','bottom']) test(`align ${alignment} within rotated selection ${mode} cells=${cells}`, () => {
    const {g,layouts} = fixture(mode,true);
    const initial = selectionBounds(ids.map(id=>layouts[id][mode]));
    const result = alignSelection(layouts,ids,mode,alignment,{cells});
    const horizontal = ['left','horizontal','right'].includes(alignment);
    const fraction = ['horizontal','vertical'].includes(alignment) ? .5 : ['right','bottom'].includes(alignment) ? 1 : 0;
    const position = horizontal ? 'left' : 'top';
    const size = horizontal ? 'width' : 'height';
    for (const id of ids) {
      const b = selectionBounds([result[id]]);
      close(b[position]+b[size]*fraction,initial[position]+initial[size]*fraction);
      close(result[id]._rect[horizontal?'top':'left'],layouts[id][mode]._rect[horizontal?'top':'left']);
      close(result[id]._rect.width,layouts[id][mode]._rect.width);
      close(result[id]._rect.height,layouts[id][mode]._rect.height);
    }
    checkSaved(result,layouts,mode,g,cells);
  });
}
