import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTE, COLUMNS, minimumSpans } from '../src/placement.mjs';
import { canvasColumns, canvasRows, dragMovePlacement, dragResizePlacement, nudgeCanvasPlacement, resizeCanvasWithKey, savedCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveCanvasLayouts, saveGroupMove, releaseCanvasGroup, releaseGroupSiblings, sourcePlacement, rotatedBounds, groupingConflict, groupingLayers, paintLayers, layoutLeaves, nudgeGroupPlacement, translateGroupPlacement } from '../src/canvas-groups.mjs';
const padding = { top: 24, right: 24, bottom: 24, left: 24 };
const geometry = Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, {
  ...canvasColumns(1200, padding, 100, 1100, 12, mode), ...canvasRows(24, 24, 24, 12), gap: 12,
}]));
const leaf = (id, column, row, extra = {}) => ({ clientId: id, name: 'core/paragraph', attributes: { content: id,
  [ATTRIBUTE]: { layers: { desktop: column, tablet: column, mobile: column }, desktop: { gridColumns: 24, column, columnSpan: 5, row, rowSpan: 3, rotation: 13 }, ...extra } }, innerBlocks: [] });
const group = (id, innerBlocks, extra = {}) => ({ clientId: id, name: 'core/group', attributes: { [ATTRIBUTE]: { group: 1, ...extra } }, innerBlocks });
const almost = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
const sameRect = (a,b) => ['left','top','width','height'].forEach(key=>almost(a[key],b[key]));

test('grouping preserves fractional frames, rotation, settings and automatic breakpoints', () => {
  const a=leaf('a',2,2,{fit:'contain',fitArea:true,desktop:{gridColumns:24,free:{x:.12731,y:1.375,width:.23219,ratio:1.4381},rotation:23}}), b=leaf('b',12,6);
  const before=resolveCanvasLayouts([a,b],geometry), after=resolveCanvasLayouts([group('g',[a,b])],geometry);
  for(const mode of Object.keys(COLUMNS)) for(const id of ['a','b']) {
    sameRect(before[id][mode]._rect,after[id][mode]._rect);
    assert.equal(after[id][mode].rotation,before[id][mode].rotation);
  }
  assert.equal(after.a.fit,'contain'); assert.equal(after.a.fitArea,true);
  assert.equal(a.attributes[ATTRIBUTE].mobile,undefined);
  const bounds=rotatedBounds(after.a.desktop._rect,23), outer=after.g.desktop._rect;
  assert.ok(outer.left<=bounds.left && outer.top<=bounds.top);
});

test('nested movement and ungrouping preserve every responsive viewport', () => {
  const a=leaf('a',2,2), b=leaf('b',12,6,{mobile:{gridColumns:8,column:1,columnSpan:8,row:15,rowSpan:4}});
  let inner=group('inner',[a,b]), outer=group('outer',[inner],{offset:{desktop:{x:.0235,y:1.125},mobile:{x:0,y:3.75}}});
  let before=resolveCanvasLayouts([outer],geometry);
  const p=before.inner.tablet;
  inner={...inner,attributes:{[ATTRIBUTE]:saveGroupMove(inner.attributes[ATTRIBUTE],p,{_rect:{...p._rect,left:p._rect.left+13.37,top:p._rect.top+8.81}},'tablet')}};
  outer={...outer,innerBlocks:[inner]};
  before=resolveCanvasLayouts([outer],geometry);
  const released=releaseCanvasGroup({...outer,innerBlocks:releaseCanvasGroup(inner)});
  const after=resolveCanvasLayouts(released,geometry);
  for(const mode of Object.keys(COLUMNS)) for(const id of ['a','b']) sameRect(before[id][mode]._rect,after[id][mode]._rect);
  assert.equal(released[0].attributes[ATTRIBUTE].mobile,undefined);
});

test('child edits convert from visible coordinates without double-applying parent movement', () => {
  const a=leaf('a',2,2), g=group('g',[a],{offset:{desktop:{x:.05,y:2}}});
  const before=resolveCanvasLayouts([g],geometry).a.desktop;
  const source=sourcePlacement({...before,rotation:29,_rect:{...before._rect,left:before._rect.left+21.25}},'desktop',before);
  const original=resolveCanvasLayouts([a],geometry).a.desktop;
  almost(source._rect.left,original._rect.left+21.25);
  almost(source._rect.top,original._rect.top);
  assert.equal(source.rotation,29);
});

test('pointer and keyboard edits of a translated child snap visibly and reopen at the same position', () => {
  const child = leaf('a', 5, 4), container = group('g', [child], { offset: { desktop: { x: .0235, y: 1.125 } } });
  const start = resolveCanvasLayouts([container], geometry).a.desktop;
  const minimum = minimumSpans(child.name);
  assert.ok(start.free);
  const edits = [
    ...[[17, 0], [0, 19], [17, 19]].map(([x, y]) => {
      const preview = dragMovePlacement(start, 'desktop', x, y, minimum);
      almost(preview._rect.left, start._rect.left + x);
      almost(preview._rect.top, start._rect.top + y);
      const next = snapCanvasPlacement(preview, 'desktop', minimum, start);
      assert.equal(next.columnSpan, start.columnSpan);
      assert.equal(next.rowSpan, start.rowSpan);
      return next;
    }),
    ...[[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, y]) => nudgeCanvasPlacement(start, 'desktop', x, y, minimum)),
    snapCanvasPlacement(dragResizePlacement(start, 'desktop', 'e', 65, 0, minimum), 'desktop', minimum),
    resizeCanvasWithKey(start, 'desktop', 1, 0, minimum),
  ];
  for (const next of edits) {
    assert.equal(savedCanvasPlacement(next).free, undefined);
    const { _rect: r, _canvas: g } = next;
    for (const [tracks, edge, position] of [[g.columns, 'start', r.left], [g.columns, 'end', r.left + r.width], [g.rows, 'start', r.top], [g.rows, 'end', r.top + r.height]]) {
      assert.ok(tracks.some(track => Math.abs(track[edge] - position) < 1e-7));
    }
    const saved = savedCanvasPlacement(sourcePlacement(next, 'desktop', start));
    const edited = { ...child, attributes: { ...child.attributes, [ATTRIBUTE]: { ...child.attributes[ATTRIBUTE], desktop: saved } } };
    const reopened = resolveCanvasLayouts(JSON.parse(JSON.stringify([{ ...container, innerBlocks: [edited] }])), geometry).a.desktop;
    sameRect(reopened._rect, next._rect);
    assert.equal(reopened.rotation, start.rotation);
  }
});

test('group pointer and keyboard moves translate exact frames without snapping or changing the other axis', () => {
  const blocks=[group('g',[leaf('a',1,1),leaf('b',4,3)],{offset:{desktop:{x:-.07531,y:-.125}}})];
  const current=resolveCanvasLayouts(blocks,geometry).g.desktop;
  const pointer=translateGroupPlacement(current,'desktop',0,18.17);
  const keyboard=nudgeGroupPlacement(current,'desktop',0,1);
  for (const next of [pointer,keyboard]) {
    almost(next._rect.left,current._rect.left);
    almost(next._rect.width,current._rect.width);
    almost(next._rect.height,current._rect.height);
  }
  almost(pointer._rect.top-current._rect.top,18.17);
  almost(keyboard._rect.top-current._rect.top,36);
});

test('group padding expands bounds while children and siblings stay fixed', () => {
  const a=leaf('a',2,2), b=leaf('b',12,6), g=group('g',[a]);
  const before=resolveCanvasLayouts([g,b],geometry);
  const padded=Object.fromEntries(Object.entries(geometry).map(([mode,value])=>[mode,{...value,groupInsets:{g:{top:17,right:21,bottom:19,left:23}}}]));
  const after=resolveCanvasLayouts([g,b],padded);
  for(const mode of Object.keys(COLUMNS)) {
    sameRect(before.a[mode]._rect,after.a[mode]._rect); sameRect(before.b[mode]._rect,after.b[mode]._rect);
    almost(after.g[mode]._rect.width,before.g[mode]._rect.width+44);
    almost(after.g[mode]._rect.top,before.g[mode]._rect.top-17);
  }
});

test('automatic layout inputs retain original source order through grouping', () => {
  const a=leaf('a',2,2,{order:0}), b=leaf('b',7,3,{order:1}), c=leaf('c',12,4,{order:2});
  assert.deepEqual(layoutLeaves([group('g',[a,c]),b]).map(b=>b.clientId),['a','b','c']);
  const auto={...geometry,mobile:{...geometry.mobile,automatic:{0:{gridColumns:8,column:1,columnSpan:8,row:1,rowSpan:3},1:{gridColumns:8,column:1,columnSpan:8,row:5,rowSpan:3},2:{gridColumns:8,column:1,columnSpan:8,row:9,rowSpan:3}}}};
  const before=resolveCanvasLayouts([a,b,c],auto),after=resolveCanvasLayouts([group('g',[a,c]),b],auto);
  for(const id of ['a','b','c']) sameRect(before[id].mobile._rect,after[id].mobile._rect);
});

test('overlapping interleaved layers cannot silently become one stacking context', () => {
  const blocks=[1,2,3].map(n=>leaf(String(n),2,2,{desktop:{gridColumns:24,column:2,columnSpan:6,row:2,rowSpan:4,layer:n}}));
  const layouts=resolveCanvasLayouts(blocks,geometry);
  assert.match(groupingConflict(blocks,['1','3'],layouts),/intervening/);
  assert.equal(groupingConflict(blocks,['1','2'],layouts),null);
});

test('a safe group layer preserves overlap even when a distant child is above the outside block', () => {
  const a=leaf('a',2,2), outside=leaf('outside',2,2), b=leaf('b',17,12);
  a.attributes[ATTRIBUTE].layers.desktop=1;
  outside.attributes[ATTRIBUTE].layers.desktop=2;
  b.attributes[ATTRIBUTE].layers.desktop=3;
  const before=resolveCanvasLayouts([a,outside,b],geometry);
  const saved=groupingLayers([a,outside,b],['a','b'],before);
  assert.ok(saved.desktop<2);
  const blocks=[group('g',[a,b],{layers:saved}),outside];
  const after=resolveCanvasLayouts(blocks,geometry), paint=paintLayers(blocks,after,'desktop');
  assert.ok(paint.g<paint.outside);
  assert.ok(paint.a<paint.b);
  assert.ok(Object.values(paint).every(Number.isInteger));
});

test('ungroup after changing the group layer preserves internal and external paint order', () => {
  const a=leaf('a',2,2), b=leaf('b',3,2), outside=leaf('outside',4,2);
  const g=group('g',[b,a],{layers:{desktop:10,tablet:1,mobile:10},offset:{desktop:{x:.1,y:1.25}}});
  const before=resolveCanvasLayouts([g,outside],geometry);
  const released=releaseGroupSiblings([g,outside],'g',before);
  const after=resolveCanvasLayouts(released,geometry);
  for(const mode of Object.keys(COLUMNS)) {
    for(const id of ['a','b','outside']) sameRect(before[id][mode]._rect,after[id][mode]._rect);
    assert.ok(after.a[mode].layer<after.b[mode].layer);
    assert.equal(after.a[mode].layer>after.outside[mode].layer,before.g[mode].layer>before.outside[mode].layer);
  }
});

test('responsive visibility changes group bounds without moving visible children', () => {
  const a=leaf('a',2,2), b=leaf('b',17,12);
  b.attributes.metadata={blockVisibility:{viewport:{mobile:false}}};
  const after=resolveCanvasLayouts([group('g',[a,b])],geometry);
  sameRect(after.g.mobile._rect,rotatedBounds(after.a.mobile._rect,after.a.mobile.rotation));
  assert.ok(after.g.desktop._rect.height>rotatedBounds(after.a.desktop._rect,after.a.desktop.rotation).height);
});
