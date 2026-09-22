import { compactCanvas, serializePlacement } from '../src/serialization.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { normalizePlacement, projectPlacement } from '../src/placement.mjs';
import { resolveLayouts, ATTRIBUTE, savePlacement } from '../src/geometry.mjs';

const file = new URL('../includes/canvas.php', import.meta.url).pathname;
const modes = ['desktop', 'tablet', 'mobile'];
const authored = { column: 7, columnSpan: 8, row: 3, rowSpan: 4, layer: 3, rotation: -15, anchors: { left: 4, right: 12, top: 2, bottom: 6 } };

test('PHP and JavaScript project current grid densities and semantic anchors identically', () => {
  const cases = modes.flatMap(source => modes.flatMap(target => [
    authored,
    { ...authored, gridColumns: { desktop:24, tablet:12, mobile:12 }[source] },
    { ...authored, anchors: { ...(authored).anchors, left: 'padding', right: 'canvas' } },
    { ...authored, anchors: { ...(authored).anchors, left: 'wide', right: 'wide' } },
    { ...authored, anchors: { ...(authored).anchors, left: 'center', right: 'wide-end' } },
    { ...authored, anchors: { ...(authored).anchors, left: 'wide-start', right: 'center' } },
    { ...authored, anchorOffsets: { right: 3, bottom: 2.375 } },
    { ...authored, anchorOffsets: { left: 0, top: 2048, bottom: -1, right: 2049 } },
    { ...authored, anchors: { ...(authored).anchors, left: 'after:2', top: 'after:2', bottom: 'canvas' } },
    { column:24, columnSpan:1, row:500, rowSpan:1 },
  ].map(value => ({ source, target, value }))));
  const result = spawnSync('php', ['-r', `define('ABSPATH', '/'); function add_action() {} function add_filter() {} require $argv[1]; $cases=json_decode(stream_get_contents(STDIN),true); echo json_encode(array_map(function($c) { return PlaygroundPlugin\\Canvas\\project_placement(PlaygroundPlugin\\Canvas\\placement($c['value'],$c['source'],1,1,'core/buttons'),$c['source'],$c['target'],'core/buttons'); },$cases));`, file], { input:JSON.stringify(cases), encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const minimum = { columnSpan:4, rowSpan:2 };
  assert.deepEqual(JSON.parse(result.stdout), cases.map(c => projectPlacement(normalizePlacement(c.value,c.source,{},minimum),c.source,c.target,minimum)));
});

test('responsive projection uses the source viewport density without altering it', () => {
  const saved = {desktop:authored};
  const result = resolveLayouts([{clientId:'a',name:'core/paragraph',attributes:{[ATTRIBUTE]:saved}}]).a;
  assert.equal(result.desktop.anchors?.left, 4);
  assert.equal(result.tablet.anchors?.left, 2);
  assert.deepEqual(saved,{desktop:authored});
});

test('repeated resolution and save/reopen do not accumulate rounding', () => {
  const raw = compactCanvas({desktop:authored});
  const block = saved => ({clientId:'a',name:'core/paragraph',attributes:{[ATTRIBUTE]:saved}});
  let saved = raw;
  const expected = resolveLayouts([block(saved)]).a.tablet;
  for (let i=0;i<20;i++) {
    const resolved = resolveLayouts([block(saved)]).a;
    saved = JSON.parse(JSON.stringify(savePlacement(saved,resolved,'tablet',resolved.tablet)));
    assert.deepEqual(resolveLayouts([block(saved)]).a.tablet, expected);
    assert.deepEqual(saved.desktop,raw.desktop);
    assert.equal(saved.mobile,undefined);
  }
});

test('responsive CSS uses the installed WordPress API for default and custom breakpoints', async (t) => {
  const { existsSync } = await import('node:fs');
  const core = new URL('../.playground/wordpress/wp-includes/class-wp-theme-json.php', import.meta.url).pathname;
  if (!existsSync(core)) return t.skip('Requires the local WordPress installation.');
  const code = `define('ABSPATH','/'); function add_action() {} function add_filter() {} function wp_enqueue_style($handle) {} function wp_get_global_settings() { return $GLOBALS['settings']; } function wp_add_inline_style($handle,$css) { echo $css; } require $argv[1]; require $argv[2]; $GLOBALS['settings']=json_decode(stream_get_contents(STDIN),true); PlaygroundPlugin\\Canvas\\enqueue_viewport_styles();`;
  for (const [settings, mobile, tablet] of [[{},'480px','782px'],[{viewport:{mobile:'600px',tablet:'900px'}},'600px','900px'],[{viewport:{mobile:'30em',tablet:'60em'}},'30em','60em']]) {
    const result = spawnSync('php',['-r',code,file,core],{input:JSON.stringify(settings),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.ok(result.stdout.includes(`@media (width <= ${mobile})`));
    assert.ok(result.stdout.includes(`@media (${mobile} < width <= ${tablet})`));
    assert.ok(result.stdout.includes(`--canvas-range-start:${mobile};`));
    assert.ok(result.stdout.includes('--canvas-range-start:0px;'));
    assert.ok(result.stdout.includes('repeat(11,minmax'));
    assert.equal((result.stdout.match(/repeat\(11,minmax/g) || []).length, 2);
    assert.ok(!result.stdout.includes('repeat(7,minmax'));
    assert.ok(!result.stdout.includes('1024px'));
  }
});
