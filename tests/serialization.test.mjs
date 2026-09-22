import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { compactCanvas, serializePlacement } from '../src/serialization.mjs';
import { resolveLayouts, savePlacement, duplicateLayout } from '../src/geometry.mjs';
import { canvasColumns, canvasRows, dragCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';

const desktop = { column: 6, row: 3, columnSpan: 13, rowSpan: 13, gridColumns: 24 };
const preciseFree = { x: 0.06393635827931644, y: 4.999999999999997, width: 0.8721272834413671, ratio: 3.6748274320901837 };
const roundedFree = { x: 0.063936, y: 5, width: 0.872127, ratio: 3.674827 };
const block = (canvas, id = 'a') => ({ clientId: id, name: 'core/paragraph', attributes: { canvas }, innerBlocks: [] });
const geometry = (width, mode = 'desktop', count = 24) => {
  const start = Math.max(24, (width - 996) / 2), padding = { left: 24, right: 24, top: 24, bottom: 24 };
  return { ...canvasColumns(width, padding, start, width - start, 12, mode, count, { ...padding, left: start, right: start }),
    ...canvasRows(24, 24, 40, 12), gap: 12, hasWide: true };
};

test('compact attributes retain intent and are idempotent without mutating the source', () => {
  const source = { shape: 'none', fit: 'cover', verticalAlign: 'top', fitArea: false, layers: {},
    desktop: { ...desktop, layer: 9, rotation: 0, frameRatio: 1.0184275607717435, anchors: { left: 5, right: 18, top: 2, bottom: 15 }, _rect: { width: 50 } }, mobile: {},
    group: 1, order: 0, offset: { desktop: { x: .123456789, y: 0 } }, imagePosition: { x: .2, y: .7 }, aspectRatio: 1.123456789,
  };
  const before = structuredClone(source), compact = compactCanvas(source);
  assert.deepEqual(compact, { desktop: { ...desktop, frameRatio: 1.01843 }, mobile: {}, group: 1, order: 0,
    offset: source.offset, imagePosition: source.imagePosition, aspectRatio: source.aspectRatio });
  assert.deepEqual(compactCanvas(compact), compact);
  assert.deepEqual(source, before);
  assert.equal(compactCanvas({desktop:{frameRatio:1e-12}}).desktop.frameRatio, 1e-12);
});

test('free-frame saves remove decimal noise without retaining pinning metadata or accumulating drift', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const anchorY of [undefined, 'top', 'center', 'bottom']) {
    const free = { ...preciseFree, ...(anchorY ? { anchorY } : {}) };
    const raw = { [mode]: { ...desktop, free } }, before = structuredClone(raw);
    let saved = compactCanvas(raw);
    assert.deepEqual(saved[mode].free, roundedFree);
    assert.deepEqual(raw, before);
    assert.notEqual(saved[mode].free, free);
    const canonical = JSON.stringify(saved);
    for (let i = 0; i < 20; i++) {
      saved = compactCanvas(JSON.parse(JSON.stringify(saved)));
      assert.equal(JSON.stringify(saved), canonical);
    }
  }
  for (const width of [320, 480, 782, 1440, 1920, 3840]) {
    const raw = { desktop: { ...desktop, free: preciseFree } }, g = { desktop: geometry(width) };
    const before = resolveLayouts([block(raw)], g).a.desktop._rect;
    const after = resolveLayouts([block(compactCanvas(raw))], g).a.desktop._rect;
    for (const key of ['left', 'top', 'width', 'height']) {
      assert.ok(Math.abs(before[key] - after[key]) < .01, `${width}px ${key}: rounding must stay below .01px`);
    }
  }
});

test('named and outside-grid anchors survive compaction and density changes', () => {
  for (const anchors of [{left:5,right:18,top:2,bottom:15}, {left:'wide',right:'wide'}, {left:-3,right:26,top:-1,bottom:'after:2'}, {left:'center',right:'canvas'}, {top:'padding',bottom:'canvas'}]) {
    const raw = { desktop: { ...desktop, anchors } }, compact = compactCanvas(raw);
    for (const width of [320,480,782,1440,1920,3840]) for (const count of [12,18,24]) {
      const g={desktop:geometry(width,'desktop',count)};
      assert.deepEqual(resolveLayouts([block(raw)],g).a.desktop._rect,resolveLayouts([block(compact)],g).a.desktop._rect);
    }
  }
});

test('layer-only overrides remain independent from automatic geometry and duplication', () => {
  const saved = { desktop, layers: { desktop: 8.5, mobile: -0.5 } };
  const before = structuredClone(saved), layouts = resolveLayouts([block(saved), block({desktop},'b')]);
  assert.equal(layouts.a.desktop.layer,8.5);
  assert.equal(layouts.a.tablet.layer,1);
  assert.equal(layouts.a.mobile.layer,-.5);
  assert.equal(layouts.b.mobile.layer,2);
  const moved=savePlacement(saved,layouts.a,'desktop',{...layouts.a.desktop,row:8});
  const copy=duplicateLayout(resolveLayouts([block(moved)]).a,moved);
  for (const value of [moved,copy]) {
    assert.deepEqual(value.layers,saved.layers);
    assert.equal(value.tablet,undefined); assert.equal(value.mobile,undefined);
    assert.equal(value.desktop.layer,undefined);
  }
  assert.deepEqual(saved,before);
});

test('zero rotation is omitted without losing an explicit responsive reset', () => {
  const saved=compactCanvas({desktop:{...desktop,rotation:30},tablet:{...desktop,gridColumns:12,column:1,columnSpan:10,rotation:0}});
  assert.equal(saved.tablet.rotation,undefined);
  const layouts=resolveLayouts([block(saved)]).a;
  assert.equal(layouts.desktop.rotation,30);
  assert.equal(layouts.tablet.rotation ?? 0,0); assert.equal(layouts.mobile.rotation ?? 0,0);
});

test('snap mutations do not mutate nested authored anchors or accumulate save noise', () => {
  const saved=compactCanvas({desktop:{...desktop,anchors:{left:'wide',right:'wide'}}}), initial=structuredClone(saved);
  const g={desktop:geometry(1440)}, start=resolveLayouts([block(saved)],g).a;
  const original=structuredClone(savedCanvasPlacement(start.desktop));
  dragCanvasPlacement(start.desktop,'desktop','move',50,36,{columnSpan:1,rowSpan:1});
  assert.deepEqual(savedCanvasPlacement(start.desktop),original); assert.deepEqual(saved,initial);
  let next=savePlacement(saved,start,'desktop',start.desktop);
  const canonical=JSON.stringify(next), expected=resolveLayouts([block(next)],g).a.desktop._rect;
  for(let i=0;i<20;i++) {
    const resolved=resolveLayouts([block(next)],g).a;
    assert.deepEqual(resolved.desktop._rect,expected);
    next=JSON.parse(JSON.stringify(savePlacement(next,resolved,'desktop',resolved.desktop)));
    assert.equal(JSON.stringify(next),canonical);
  }
});

test('PHP and JavaScript compact the same schema, including fractional layers and free frames', () => {
  const cases=[{}, ...[{left:'wide'}, {right:'canvas'}, {left:'wide',right:18}, {left:5,right:'wide'}].map(anchors=>({desktop:{...desktop,free:preciseFree,anchors}})), {desktop:{...desktop,anchorOffsets:{right:3,bottom:2.375}}}, {desktop:{rowSpan:3,anchors:{top:0,bottom:3}}}, {fitArea:false,shape:'none',layers:{},mobile:{}}, {fitArea:true,layers:{desktop:1.5,tablet:-.5},desktop:{...desktop,rotation:360,frameRatio:1.0184275607717435,anchors:{left:5,right:'wide',top:2,bottom:15}}},
    {group:1,order:2,offset:{mobile:{x:.123456789,y:1.75}},desktop:{...desktop,free:{x:.123456789,y:1.123456789,width:.333333333,ratio:1.123456789},anchors:{left:-2,right:25,top:'after:0',bottom:'canvas'}}},
    ...['desktop', 'tablet', 'mobile'].flatMap(mode => [
      { ...preciseFree, anchorY: 'center' },
      { x: .1234565, y: -1.2345675, width: .000001, ratio: 1000000, anchorY: 'bottom' },
      { x: .0000001, y: -.0000001, width: 1e-12, ratio: 1e-12, anchorY: 'top' },
      { x: .0000005, y: -.0000005, width: .5, ratio: 1 },
    ].map(free => ({ [mode]: { ...desktop, free } })))];
  const php=spawnSync('php',['-r',String.raw`define('ABSPATH','/'); function add_action(){} function add_filter(){} require $argv[1]; $cases=json_decode(stream_get_contents(STDIN),true); echo json_encode(array_map('PlaygroundPlugin\Canvas\compact_canvas',$cases));`,new URL('../includes/canvas.php',import.meta.url).pathname],{input:JSON.stringify(cases),encoding:'utf8'});
  assert.equal(php.status,0,php.stderr);
  assert.deepEqual(JSON.parse(php.stdout),cases.map(compactCanvas));
  for(const value of cases) for(const [mode,p] of Object.entries(compactCanvas(value)).filter(([key])=>['desktop','tablet','mobile'].includes(key))) assert.deepEqual(serializePlacement(p,mode),p);
});

test('PHP paint ranks match JavaScript fractional layers, source order, and grouped viewports', async () => {
  const {resolveCanvasLayouts,paintLayers}=await import('../src/canvas-groups.mjs');
  const a=block({desktop,layers:{desktop:-.5,mobile:9},order:0},'a');
  const b=block({desktop,layers:{desktop:2.5,mobile:1},order:1},'b');
  const outside=block({desktop,layers:{desktop:1.5,mobile:3},order:2},'outside');
  const group={clientId:'group',name:'core/group',attributes:{canvas:{group:1}},innerBlocks:[a,b]};
  const blocks=[group,outside], g=Object.fromEntries(['desktop','tablet','mobile'].map(mode=>[mode,geometry(1200,mode,mode==='desktop'?24:mode==='tablet'?12:8)]));
  const resolved=resolveCanvasLayouts(blocks,g);
  const expected=Object.fromEntries(Object.keys(g).map(mode=>[mode,paintLayers(blocks,resolved,mode)]));
  const code=String.raw`define('ABSPATH','/'); function add_action(){} function add_filter(){} require $argv[1];
  function make($v){$o=(object)['id'=>$v['clientId'],'name'=>$v['name'],'attributes'=>$v['attributes'],'inner_blocks'=>new ArrayIterator(array_map('make',$v['innerBlocks']))];return $o;}
  $blocks=array_map('make',json_decode(stream_get_contents(STDIN),true));$ranks=PlaygroundPlugin\Canvas\canvas_paint_layers($blocks);$result=[];
  function collect($blocks,$ranks,&$result){foreach($blocks as $b){foreach($ranks[spl_object_id($b)] as $mode=>$rank)$result[$mode][$b->id]=$rank;collect($b->inner_blocks,$ranks,$result);}}
  collect($blocks,$ranks,$result);echo json_encode($result);`;
  const php=spawnSync('php',['-r',code,new URL('../includes/canvas.php',import.meta.url).pathname],{input:JSON.stringify(blocks),encoding:'utf8'});
  assert.equal(php.status,0,php.stderr);assert.deepEqual(JSON.parse(php.stdout),expected);
});

test('sparse coordinates never erase anchors using context-dependent append defaults', () => {
  const raw={desktop:{columnSpan:4,rowSpan:3,anchors:{left:0,top:0,bottom:3}}};
  const compact=compactCanvas(raw);
  assert.deepEqual(compact.desktop.anchors,{left:0});
  const preceding=block({desktop:{...desktop,row:20,rowSpan:10}},'before');
  const g={desktop:geometry(1440)};
  assert.deepEqual(resolveLayouts([preceding,block(compact)],g).a.desktop._rect,resolveLayouts([preceding,block(raw)],g).a.desktop._rect);
});


test('PHP and JavaScript normalize precise frames and ignore removed pinning fields identically', async () => {
  const { normalizeFreeFrame } = await import('../src/aspect-ratio.mjs');
  const cases=[null,{}, {...preciseFree,anchorY:'bottom'}, {x:-2,y:600,width:2,ratio:1e-12}, {x:.7,y:-600,width:1e-12,ratio:2e6}, {x:0,y:0,width:0,ratio:1}];
  const php=spawnSync('php',['-r',String.raw`define('ABSPATH','/'); function add_action(){} function add_filter(){} require $argv[1]; echo json_encode(array_map('PlaygroundPlugin\Canvas\normalize_free_frame',json_decode(stream_get_contents(STDIN),true)));`,new URL('../includes/canvas.php',import.meta.url).pathname],{input:JSON.stringify(cases),encoding:'utf8'});
  assert.equal(php.status,0,php.stderr);
  assert.deepEqual(JSON.parse(php.stdout),cases.map(value=>normalizeFreeFrame(value)??null));
});
