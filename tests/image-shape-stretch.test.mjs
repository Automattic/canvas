import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { imageShapeStretch, imageResizeRatio, preferredShapeRatio, shapeInsets, shapeMask } from '../src/image-shapes.mjs';
import { imageShapeUpdates } from '../src/image-shape-layout.mjs';
import { resolveLayouts } from '../src/geometry.mjs';
import { compactCanvas } from '../src/serialization.mjs';
import { canvasColumns, canvasRows, dragResizePlacement } from '../src/canvas-geometry.mjs';

const shapes = ['circle', 'clover', 'flower', 'scallop', 'tilted-oval', 'ellipse', 'diamond', 'soft-square', 'arch'];
const resolve = saved => resolveLayouts([{ clientId: 'image', name: 'core/image', attributes: { canvas: saved } }]).image;
const frame = { _rect: { width: 400, height: 200 } };

test('stretch fills every shape frame and preserving proportions uses each shape ratio', () => {
  for (const shape of shapes) for (const shapeStretch of [true, false]) {
    const saved = { shape, shapeStretch, fill: false, imagePosition: { x: .2, y: .7 }, desktop: { columnSpan: 8, rowSpan: 4 } };
    const before = structuredClone(saved), layout = resolve(saved);
    assert.equal(layout.shapeStretch, shapeStretch);
    assert.equal(layout.fill, true);
    assert.equal(imageResizeRatio(layout, frame), undefined);
    for (const [width, height] of [[400, 200], [200, 400]]) {
      const { x, y } = shapeInsets(width, height, shape, shapeStretch);
      if (shapeStretch) assert.deepEqual({ x, y }, { x: 0, y: 0 });
      else assert.ok(Math.abs((width - 2 * x) / (height - 2 * y) - preferredShapeRatio(shape)) < 1e-8);
    }
    assert.deepEqual(layout.desktop, resolve({ ...saved, shapeStretch: !shapeStretch }).desktop);
    assert.deepEqual(layout.imagePosition, saved.imagePosition);
    assert.deepEqual(saved, before);
  }
});

test('stretch is independent of explicit and temporary frame resize locks', () => {
  assert.equal(imageResizeRatio(resolve({ shape: 'circle', shapeStretch: true }), frame), undefined);
  assert.equal(imageResizeRatio(resolve({ shape: 'circle', shapeStretch: true, aspectRatio: 1.7 }), frame), 2);
  assert.equal(imageResizeRatio(resolve({ shape: 'circle', shapeStretch: true }), frame, true), 2);
  assert.equal(imageResizeRatio(resolve({ shape: 'ellipse', shapeStretch: false, aspectRatio: 1.7 }), frame), 2);
  for (const invalid of [null, 'true', 0, 1, {}]) {
    assert.equal(imageShapeStretch({ shape: 'circle', shapeStretch: invalid }), false);
    assert.equal(imageShapeStretch({ shape: 'ellipse', shapeStretch: invalid }), false);
    assert.equal(compactCanvas({ shapeStretch: invalid }).shapeStretch, undefined);
  }
  for (const shapeStretch of [true, false]) {
    assert.equal(imageShapeStretch({ shape: 'none', shapeStretch }), false);
    assert.equal(shapeMask('none', shapeStretch), undefined);
  }
});

test('shape changes restore stretch defaults without changing the frame', () => {
  const padding = { top: 24, right: 24, bottom: 24, left: 24 };
  const geometry = { desktop: { ...canvasColumns(1200, padding, 24, 1176, 12, 'desktop'), ...canvasRows(24, 24, 30, 12), gap: 12 } };
  const attributes = { canvas: { shape: 'ellipse', shapeStretch: true, desktop: { column: 3, columnSpan: 9, row: 6, rowSpan: 3 } } };
  const layout = resolveLayouts([{ clientId: 'image', name: 'core/image', attributes }], geometry).image;
  const proposed = imageShapeUpdates(attributes, layout, 'desktop', 'diamond', true);
  assert.deepEqual(proposed.canvas.desktop, attributes.canvas.desktop);
  assert.equal(proposed.canvas.shapeStretch, undefined);
  assert.equal(imageShapeStretch(proposed.canvas), false);
  const stretched = dragResizePlacement(layout.desktop, 'desktop', 'e', 30, 0, { columnSpan: 1, rowSpan: 1 }, imageResizeRatio(layout, layout.desktop));
  assert.ok(Math.abs(stretched._rect.height - layout.desktop._rect.height) < 1e-8);
  assert.ok(stretched._rect.width > layout.desktop._rect.width);
  const contained = { ...attributes, canvas: { ...attributes.canvas, shapeStretch: false } };
  const fitted = imageShapeUpdates(contained, layout, 'desktop', 'diamond', true);
  assert.deepEqual(fitted.canvas.desktop, attributes.canvas.desktop);
  assert.equal(fitted.canvas.shapeStretch, undefined);
  assert.equal(imageShapeStretch(fitted.canvas), false);
});

test('PHP rendering, authoring and serialization preserve both stretch overrides and match the editor', () => {
  const cases = shapes.flatMap(shape => [undefined, true, false, null, 'true', 1].map(shapeStretch => ({ shape, shapeStretch })));
  const code = String.raw`
    define('ABSPATH','/'); function add_action() {} function add_filter() {}
    function esc_attr($s) { return htmlspecialchars((string)$s, ENT_QUOTES); }
    function wp_json_encode($s) { return json_encode($s); }
    class WP_Error { function __construct(...$args) {} }
    require $argv[1]; require dirname($argv[1]).'/abilities.php';
    $result=[];
    foreach(json_decode(stream_get_contents(STDIN),true) as $saved) {
      $stretch=PlaygroundPlugin\Canvas\image_shape_stretch($saved['shape'],$saved['shapeStretch']??null);
      $block=(object)['name'=>'core/image','attributes'=>['canvas'=>$saved]];
      $next=['desktop'=>1,'tablet'=>1,'mobile'=>1];
      $result[]=['stretch'=>$stretch,'mask'=>PlaygroundPlugin\Canvas\image_mask($saved['shape'],$stretch),
        'saved'=>PlaygroundPlugin\Canvas\compact_canvas($saved),
        'valid'=>true===PlaygroundPlugin\Abilities\validate_layout($saved),
        'html'=>PlaygroundPlugin\Canvas\canvas_item_open($block,0,$next,24)];
    }
    echo json_encode($result);
  `;
  const result = spawnSync('php', ['-r', code, new URL('../includes/canvas.php', import.meta.url).pathname], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  JSON.parse(result.stdout).forEach((actual, i) => {
    const saved = cases[i];
    assert.equal(actual.stretch, imageShapeStretch(saved));
    assert.equal(decodeURIComponent(actual.mask), decodeURIComponent(shapeMask(saved.shape, saved.shapeStretch)));
    assert.deepEqual(actual.saved, compactCanvas(saved));
    assert.equal(actual.valid, saved.shapeStretch === undefined || typeof saved.shapeStretch === 'boolean');
    assert.ok(actual.html.includes(`data-canvas-shape-stretch="${actual.stretch}"`));
  });
});

test('switching from a stretched shape to any square shape clears stretch overrides', () => {
  for (const shape of ['circle', 'clover', 'flower', 'scallop', 'tilted-oval', 'diamond', 'soft-square']) {
    const attributes = { canvas: { shape: 'ellipse', shapeStretch: true, desktop: { column: 2, row: 3, columnSpan: 8, rowSpan: 4 } } };
    const next = imageShapeUpdates(attributes, null, 'desktop', shape, true).canvas;
    assert.equal(imageShapeStretch(next), false);
    assert.deepEqual(next.desktop, attributes.canvas.desktop);
  }
  const attributes = { canvas: { shape: 'circle', shapeStretch: true } };
  assert.equal(imageShapeUpdates(attributes, null, 'desktop', 'circle', true), null);
});
