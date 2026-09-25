import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { canvasColumns, canvasRows, mapCanvasPlacement, mapCanvasRowsPlacement, dragMovePlacement, dragResizePlacement, snapCanvasPlacement, resizeCanvasWithKey, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { mapPlacement, normalizePlacement, resolveLayouts, savePlacement, requiredRows, nudge } from '../src/geometry.mjs';
import { compactCanvas } from '../src/serialization.mjs';
import { preserveRowsOnResize, resizeCanvasRows } from '../src/row-resize.mjs';
import { responsiveRowMetrics, sectionRows } from '../src/section-layout.mjs';
import { readablePlacements } from '../src/automatic-layout.mjs';
import { resolveCanvasLayouts } from '../src/canvas-groups.mjs';

const minimum = { columnSpan: 1, rowSpan: 1 };
const padding = { top: 37, bottom: 61, left: 24, right: 24 };
const geometry = (rows = 12, width = 1200, mode = 'desktop', pad = padding, gap = 12) => ({
  ...canvasColumns(width, pad, pad.left, width - pad.right, gap, mode),
  ...canvasRows(pad.top, pad.bottom, rows, gap, 24),
  gap, viewport: mode, referenceWidth: 1200, referenceColumns: 24,
});
const source = { column: 3, columnSpan: 8, row: 1, rowSpan: 12, gridColumns: 24, frameRatio: 1 };
const image = (canvas, id = 'image') => ({ clientId: id, name: 'core/image', attributes: { canvas }, innerBlocks: [] });
const close = (a, b) => assert.ok(Math.abs(a - b) < .01, `${a} != ${b}`);
const full = p => { close(p._rect.top, 0); close(p._rect.height, p._canvas.height); };
const outer = (g, base = source) => mapCanvasRowsPlacement(base, 'desktop', g, minimum, { top: 0, bottom: g.height });

test('only a committed edit to both outer edges activates full height', () => {
  const g = geometry(), saved = { desktop: { ...source, row: 3, rowSpan: 4 } };
  const start = resolveLayouts([image(saved)], { desktop: g }).image;
  for (const [top, bottom, expected] of [[0, g.height, true], [padding.top, g.contentEnd, undefined], [0, g.contentEnd, undefined], [padding.top, g.height, undefined]]) {
    const target = mapCanvasRowsPlacement(source, 'desktop', g, minimum, { top, bottom });
    const next = savePlacement(saved, start, 'desktop', target);
    assert.equal(next.desktop.fillHeight, expected);
    const reopened = resolveLayouts([image(next)], { desktop: g }).image.desktop;
    close(reopened._rect.top, target._rect.top);
    close(reopened._rect.height, target._rect.height);
  }
  const legacy = { desktop: savedCanvasPlacement(outer(g)) };
  const before = JSON.stringify(legacy);
  assert.equal(resolveLayouts([image(legacy)], { desktop: g }).image.desktop.fillHeight, undefined);
  assert.equal(JSON.stringify(legacy), before);
  const rotationOnly = savePlacement(legacy, resolveLayouts([image(legacy)], { desktop: g }).image, 'desktop', { ...outer(g), rotation: 20 });
  assert.equal(rotationOnly.desktop.fillHeight, undefined);
});

test('grid and precise full-height images follow growing and shrinking sections without saving geometry', () => {
  for (const free of [undefined, { x: .2, y: -1, width: .3, ratio: .1 }]) {
    const saved = { desktop: { ...source, fillHeight: true, ...(free ? { free } : {}) }, imagePosition: { x: .2, y: .8 }, fill: false, shape: 'arch', shapeStretch: false };
    const snapshot = JSON.stringify(saved);
    for (const rows of [12, 25, 3, 1, 12]) {
      const layouts = resolveLayouts([image(saved)], { desktop: geometry(rows) });
      const p = layouts.image.desktop;
      full(p);
      assert.equal(p._canvas.coreRows, rows);
      assert.equal(requiredRows(layouts, 'desktop'), 1);
      assert.deepEqual(compactCanvas({desktop: savedCanvasPlacement(p)}).desktop, saved.desktop);
      assert.deepEqual(savePlacement(saved, layouts.image, 'desktop', { ...p, rotation: 30 }), { ...saved, desktop: { ...saved.desktop, rotation: 30 } });
    }
    assert.equal(JSON.stringify(saved), snapshot);
    assert.equal(sectionRows([image(saved)], { desktop: 1, tablet: 1, mobile: 1 }).desktop, 1);
  }
});

test('responsive full height inherits unless the viewport has its own ordinary placement', () => {
  for (const width of [320, 390, 480, 481, 600, 782, 783, 1440, 2560, 3840]) for (const gap of [0, 12, 27]) {
    const saved = { desktop: { ...source, fillHeight: true, anchors: { left: 'center', right: 'canvas' } } };
    const blocks = [image(saved)];
    const g = Object.fromEntries(['desktop','tablet','mobile'].map(mode => [mode, geometry(18, width, mode, padding, gap)]));
    for (const mode of Object.keys(g)) g[mode] = responsiveRowMetrics(blocks, mode, g);
    const layouts = resolveLayouts(blocks, g).image;
    for (const mode of Object.keys(g)) { full(layouts[mode]); close(layouts[mode]._rect.left + layouts[mode]._rect.width, g[mode].width); }
    const override = { ...saved, tablet: { ...source, row: 3, rowSpan: 3, frameRatio: 2 } };
    const other = resolveLayouts([image(override)], g).image;
    assert.equal(other.tablet.fillHeight, undefined);
    assert.equal(other.mobile.fillHeight, undefined);
    assert.equal(other.desktop.fillHeight, true);
  }
});

test('pointer and keyboard edits preserve horizontal moves and release vertical edges', () => {
  const g = geometry(18), saved = { desktop: { ...source, fillHeight: true } };
  const start = resolveLayouts([image(saved)], { desktop: g }).image;
  const p = start.desktop;
  const changes = [
    [snapCanvasPlacement(dragMovePlacement(p, 'desktop', 48, 0, minimum), 'desktop', minimum, p), true],
    [nudge(p, 'desktop', 1, 0), true],
    [snapCanvasPlacement(dragResizePlacement(p, 'desktop', 's', 0, -100, minimum), 'desktop', minimum), undefined],
    [snapCanvasPlacement(dragResizePlacement(p, 'desktop', 'n', 0, 100, minimum), 'desktop', minimum), undefined],
    [resizeCanvasWithKey(p, 'desktop', 0, -1, minimum), undefined],
    [nudge(p, 'desktop', 0, 1), undefined],
  ];
  for (const [placement, expected] of changes) {
    const next = savePlacement(saved, start, 'desktop', placement);
    assert.equal(next.desktop.fillHeight, expected, JSON.stringify(placement._rect));
    const reopened = resolveLayouts([image(JSON.parse(JSON.stringify(next)))], { desktop: placement._canvas }).image.desktop;
    for (const key of ['left','top','width','height']) close(reopened._rect[key], placement._rect[key]);
    if (!expected) close(next.desktop.frameRatio, placement._rect.width / placement._rect.height);
  }
});

test('editing inherited mobile height creates an override without changing desktop', () => {
  const saved = { desktop: { ...source, fillHeight: true } };
  const g = { desktop: geometry(), mobile: geometry(20, 390, 'mobile') };
  g.mobile = responsiveRowMetrics([image(saved)], 'mobile', g);
  const start = resolveLayouts([image(saved)], g).image;
  const changed = resizeCanvasWithKey(start.mobile, 'mobile', 0, -1, minimum);
  const next = savePlacement(saved, start, 'mobile', changed);
  assert.deepEqual(next.desktop, saved.desktop);
  assert.equal(next.tablet, undefined);
  assert.equal(next.mobile.fillHeight, undefined);
  const resolved = resolveLayouts([image(next)], g).image;
  full(resolved.desktop);
  close(resolved.mobile._rect.height, changed._rect.height);
});

test('ordinary and Shift section resize previews follow height without preventing shrinking', () => {
  const saved = { desktop: { ...source, fillHeight: true } };
  const layouts = resolveLayouts([image(saved)], { desktop: geometry() });
  for (const symmetric of [false, true]) for (const delta of [-3, 3]) {
    const next = resizeCanvasRows(layouts, 'desktop', 12, requiredRows(layouts, 'desktop'), delta, symmetric);
    assert.equal(next.rows, 12 + delta * (symmetric ? 2 : 1));
    const p = preserveRowsOnResize(layouts, 'desktop', next.offset, next.rows).image;
    full(p);
    assert.equal(p._canvas.coreRows, next.rows);
    assert.deepEqual(compactCanvas({desktop: savedCanvasPlacement(p)}), saved);
  }
});

test('readable content grows independently of filling images and can shrink again', () => {
  const g = geometry(), saved = { desktop: { ...source, fillHeight: true } };
  const p = resolveLayouts([image(saved)], { desktop: g }).image.desktop;
  const text = mapCanvasPlacement({ column: 1, columnSpan: 20, row: 2, rowSpan: 2 }, 'desktop', g);
  const items = [{kind: 'image', automatic: true}, {kind: 'paragraph', explicitReadable: true}];
  const automatic = readablePlacements(items, 'desktop', g, [p, text], () => 900);
  assert.equal(automatic[0], undefined);
  const grownText = mapPlacement(automatic[1], 'desktop', g);
  close(grownText._rect.top, text._rect.top);
  const grown = mapPlacement(saved.desktop, 'desktop', grownText._canvas);
  full(grown);
  assert.ok(grown._rect.height > p._rect.height);
  const repeated = readablePlacements(items, 'desktop', grownText._canvas, [grown, text], () => 900);
  close(mapPlacement(repeated[1], 'desktop', grownText._canvas)._rect.top, text._rect.top);
  full(mapPlacement(saved.desktop, 'desktop', g));
});

test('non-image blocks and nested Group images do not resolve or acquire full height', () => {
  const saved = { desktop: { ...source, fillHeight: true } };
  const paragraph = { ...image(saved, 'paragraph'), name: 'core/paragraph' };
  const group = {clientId: 'group', name: 'core/group', attributes: {canvas: {group: 1}}, innerBlocks: [image(saved)]};
  const layouts = resolveCanvasLayouts([group, paragraph], { desktop: geometry(20) });
  assert.equal(layouts.image.desktop.fillHeight, undefined);
  assert.equal(layouts.paragraph.desktop.fillHeight, undefined);
  assert.equal(savePlacement(saved, layouts.image, 'desktop', outer(geometry(20))).desktop.fillHeight, undefined);
});

test('PHP and JavaScript normalize and compact fillHeight identically', () => {
  const values = [true, false, null, 1, 'true', undefined].map(fillHeight => ({ ...source, fillHeight }));
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const result = spawnSync('php', ['-r', `define('ABSPATH','/'); function add_action(){} function add_filter(){} require $argv[1]; echo json_encode(array_map(fn($p)=>[PlaygroundPlugin\\Canvas\\placement($p,'desktop',1,1),PlaygroundPlugin\\Canvas\\compact_canvas(['desktop'=>$p])],json_decode(stream_get_contents(STDIN),true)));`, file], { input: JSON.stringify(values), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), values.map(value => [normalizePlacement(value), compactCanvas({desktop:value})]));
});

test('PHP rendering keeps full-height images from enlarging rows and limits support to direct images', () => {
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const code = String.raw`define('ABSPATH','/'); function add_action(){} function add_filter(){}
    function esc_attr($s){return htmlspecialchars((string)$s,ENT_QUOTES);} function wp_json_encode($v){return json_encode($v);}
    require $argv[1]; $results=[];
    foreach([['core/image',false],['core/image',true],['core/paragraph',false]] as [$name,$nested]) {
      $child=(object)['name'=>$name,'attributes'=>['canvas'=>['desktop'=>['column'=>1,'columnSpan'=>12,'row'=>1,'rowSpan'=>40,'gridColumns'=>24,'fillHeight'=>true]]]];
      $next=['desktop'=>1,'tablet'=>1,'mobile'=>1];
      $html=PlaygroundPlugin\Canvas\canvas_item_open($child,0,$next,24,[],$nested);
      $results[]=['html'=>$html,'rows'=>$next];
    } echo json_encode($results);`;
  const result = spawnSync('php', ['-r', code, file], {encoding:'utf8'});
  assert.equal(result.status,0,result.stderr || result.stdout);
  const [direct,nested,text] = JSON.parse(result.stdout);
  assert.deepEqual(direct.rows,{desktop:2,tablet:2,mobile:2});
  for (const mode of ['desktop','tablet','mobile']) assert.ok(direct.html.includes(`--canvas-${mode}-line-bottom:-1;`));
  for (const other of [nested,text]) {
    assert.deepEqual(other.rows,{desktop:41,tablet:41,mobile:41});
    assert.ok(!other.html.includes('fillHeight'));
    assert.ok(!other.html.includes('line-bottom:-1'));
  }
});
