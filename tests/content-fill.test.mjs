import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { contentFill, fillUpdates, supportsFill, textWidthUpdates } from '../src/content-fill.mjs';
import { compactCanvas, compactCanvasAttributes } from '../src/serialization.mjs';
import { resolveLayouts, savePlacement, layoutVariables } from '../src/geometry.mjs';

test('images default to fill while text opts in; native width fitting keeps ownership', () => {
  for (const name of ['core/image', 'core/video', 'core/heading', 'core/paragraph']) {
    assert.equal(supportsFill(name), true);
    assert.equal(contentFill(name), ['core/image', 'core/video'].includes(name));
    assert.equal(contentFill(name, { canvas: { fill: true } }), true);
    assert.equal(contentFill(name, { canvas: { fill: false } }), false);
    if (!['core/image', 'core/video'].includes(name)) assert.equal(contentFill(name, { fitText: true, canvas: { fill: true } }), false);
  }
  for (const name of ['core/buttons', 'core/group', undefined]) {
    assert.equal(supportsFill(name), false);
    assert.equal(contentFill(name, { canvas: { fill: true } }), false);
    assert.equal(fillUpdates(name, {}, true), undefined);
  }
});

test('the shared toggle preserves authored frames and crop while changing text or image fill', () => {
  const canvas = { desktop: { row: 2, column: 3, rowSpan: 5, columnSpan: 7, fillHeight: true }, imagePosition: { x: .2, y: .8 }, aspectRatio: 1.5 };
  for (const name of ['core/image', 'core/video', 'core/heading', 'core/paragraph']) {
    const before = { canvas, ...(!['core/image', 'core/video'].includes(name) ? { fitText: true } : {}) };
    const original = structuredClone(before);
    const enabled = compactCanvasAttributes(fillUpdates(name, before, true));
    assert.deepEqual(enabled.canvas, { ...canvas, fill: true });
    assert.equal(enabled.fitText, undefined);
    assert.equal(contentFill(name, { ...before, ...enabled }), true);
    const disabled = compactCanvasAttributes(fillUpdates(name, { ...before, ...enabled }, false));
    assert.deepEqual(disabled.canvas, { ...canvas, fill: false });
    assert.equal(contentFill(name, disabled), false);
    assert.deepEqual(before, original);
  }
  assert.equal(fillUpdates('core/image', { canvas: { shape: 'circle', fill: false } }, false), undefined);
  assert.equal(contentFill('core/image', { canvas: { shape: 'circle', fill: false } }), true);
  assert.equal(contentFill('core/image', { canvas: { shape: 'none', fill: false } }), false);
});

test('moves and save/reload retain authored fill including false without materializing defaults', () => {
  for (const name of ['core/image', 'core/video', 'core/heading', 'core/paragraph']) for (const fill of [undefined, false, true]) {
    const canvas = { ...(fill === undefined ? {} : { fill }), desktop: { column: 1, row: 1, columnSpan: 6, rowSpan: 3 } };
    const block = { clientId: 'a', name, attributes: { canvas } };
    const layout = resolveLayouts([block]).a;
    const next = savePlacement(canvas, layout, 'mobile', { ...layout.mobile, row: 4 });
    assert.equal(next.fill, fill);
    const reopened = resolveLayouts([{ ...block, attributes: { canvas: JSON.parse(JSON.stringify(next)) } }]).a;
    assert.equal(reopened.fill, layout.fill);
    assert.equal(layoutVariables(reopened)['--canvas-fit'], layout.fill ? 'cover' : 'contain');
  }
});

test('PHP rendering and JavaScript share fill defaults, text fitting, shapes, and compact booleans', () => {
  const cases = ['core/image', 'core/video', 'core/heading', 'core/paragraph', 'core/group'].flatMap(name =>
    [{}, { canvas: { fill: true } }, { canvas: { fill: false } }, { canvas: { fill: false, shape: 'circle' } }, { fitText: true, canvas: { fill: true } }].map(attributes => ({ name, attributes })));
  const result = spawnSync('php', ['-r', String.raw`
    define('ABSPATH','/'); function add_action(){} function add_filter(){}
    function esc_attr($s){return htmlspecialchars((string)$s, ENT_QUOTES);} function wp_json_encode($s){return json_encode($s);}
    require $argv[1]; $out=[];
    foreach(json_decode(stream_get_contents(STDIN),true) as $case) {
      $child=(object)$case; $next=['desktop'=>1,'tablet'=>1,'mobile'=>1];
      $out[]=['fill'=>PlaygroundPlugin\Canvas\content_fill($child->name,$child->attributes),
        'canvas'=>PlaygroundPlugin\Canvas\compact_canvas($child->attributes['canvas']??[]),
        'html'=>PlaygroundPlugin\Canvas\canvas_item_open($child,0,$next,24)];
    } echo json_encode($out);`, new URL('../includes/canvas.php', import.meta.url).pathname], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  JSON.parse(result.stdout).forEach((value, index) => {
    const { name, attributes } = cases[index];
    const fill = contentFill(name, attributes);
    assert.equal(value.fill, fill);
    assert.deepEqual(value.canvas, compactCanvas(attributes.canvas));
    assert.ok(value.html.includes(`--canvas-fit:${fill ? 'cover' : 'contain'};`));
    assert.equal(value.html.includes('data-canvas-text-fit="true"'), !['core/image', 'core/video'].includes(name) && fill);
  });
});

test('removed fill attributes are neither interpreted nor serialized', () => {
  assert.deepEqual(compactCanvas({ fitArea: true, fit: 'contain' }), {});
  assert.equal(contentFill('core/heading', { canvas: { fitArea: true } }), false);
  assert.equal(contentFill('core/image', { canvas: { fit: 'contain' } }), true);
});

test('switching text modes keeps the frame and makes the modes mutually exclusive',()=>{
 const original={canvas:{fill:true,desktop:{column:2,row:3,columnSpan:8,rowSpan:4}},fontSize:'large',style:{typography:{fontSize:'40px',fontWeight:'700'}}};
 const width={...original,...textWidthUpdates(original,true)};
 assert.equal(width.fitText,true);assert.equal(width.canvas.fill,false);
 assert.deepEqual(width.canvas.desktop,original.canvas.desktop);
 assert.equal(width.fontSize,undefined);assert.equal(width.style.typography.fontSize,undefined);assert.equal(width.style.typography.fontWeight,'700');
 const area={...width,...fillUpdates('core/heading',width,true)};
 assert.equal(area.fitText,undefined);assert.equal(area.canvas.fill,true);
 assert.deepEqual(area.canvas.desktop,original.canvas.desktop);
});
