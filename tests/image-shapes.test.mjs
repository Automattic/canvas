import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { IMAGE_SHAPES, imageShape, imageFit, shapeMask, shapeInsets } from '../src/image-shapes.mjs';
import { resolveLayouts, ATTRIBUTE, duplicateLayout } from '../src/geometry.mjs';
import { coverImage, moveImagePosition } from '../src/image-position.mjs';
import { readRadiusTargets } from '../src/radius-targets.mjs';

const fixedShapes = ['circle', 'clover', 'flower', 'scallop', 'tilted-oval'];
const file = new URL('../includes/canvas.php', import.meta.url).pathname;
const resolve = saved => resolveLayouts([{ clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: saved } }]).image;
test('supported shapes resolve unchanged and produce masks', () => {
  for (const { value } of IMAGE_SHAPES.slice(1)) {
    assert.equal(imageShape(value), value);
    assert.equal(resolve({ shape: value, fit: 'contain' }).shape, value);
    assert.ok(shapeMask(value).startsWith('url('));
  }
});

test('shapes require cover without mutating fit, position, placement or aspect-ratio preferences', () => {
  for (const fit of [undefined, 'cover', 'contain']) {
    const saved = { fit, imagePosition: { x: .2, y: .7 }, aspectRatio: 1.7, desktop: { column: 2, row: 3, columnSpan: 5, rowSpan: 6 } };
    const original = structuredClone(saved);
    for (const { value } of IMAGE_SHAPES.slice(1)) {
      const shaped = { ...saved, shape: value };
      const layout = resolve(shaped);
      assert.equal(layout.fit, 'cover');
      assert.equal(layout.aspectRatio, fixedShapes.includes(value) ? 1 : 1.7);
      assert.deepEqual(layout.imagePosition, saved.imagePosition);
      assert.deepEqual(layout.desktop, resolve(saved).desktop);
      assert.equal(duplicateLayout(layout, shaped).shape, value);
      assert.equal(resolve({ ...shaped, shape: undefined }).fit, fit === 'contain' ? 'contain' : 'cover');
    }
    assert.deepEqual(saved, original);
  }
});

test('applying, switching and reopening any shape preserves the optional resize lock', () => {
  for (const { value: shape } of IMAGE_SHAPES.slice(1)) for (const aspectRatio of [undefined, 1.7]) {
    const saved = { shape, aspectRatio, fit: 'contain', desktop: { column: 2, row: 3, columnSpan: 5, rowSpan: 6 } };
    const original = structuredClone(saved);
    assert.equal(resolve(saved).aspectRatio, fixedShapes.includes(shape) ? 1 : aspectRatio);
    assert.equal(resolve(JSON.parse(JSON.stringify(saved))).aspectRatio, fixedShapes.includes(shape) ? 1 : aspectRatio);
    assert.deepEqual(saved, original);
    for (const replacement of ['clover', 'ellipse', 'flower']) {
      assert.equal(resolve({ ...saved, shape: replacement }).aspectRatio, fixedShapes.includes(replacement) ? 1 : aspectRatio);
    }
    assert.equal(resolve({ ...saved, shape: 'none' }).aspectRatio, undefined);
    assert.equal(resolve({ ...saved, shape: 'none', fit: 'cover' }).aspectRatio, aspectRatio);
  }
});

test('unsupported values are inert, including malformed serialized data', () => {
  for (const value of [undefined, null, '', 'pentagon', {}, [], '<script>', 'toString']) {
    assert.equal(imageShape(value), 'none');
    assert.equal(imageFit({ shape: value, fit: 'contain' }), 'contain');
    assert.equal(shapeMask(value), undefined);
  }
});

test('fixed silhouettes keep their intended proportions in landscape and portrait grid frames', () => {
  for (const { value, proportions: [horizontal, vertical] } of IMAGE_SHAPES.filter(shape => fixedShapes.includes(shape.value))) {
  for (const [width, height] of [[400, 200], [200, 400], [240, 240], [173.5, 87.25]]) {
    const { x, y } = shapeInsets(width, height, value);
    const innerWidth = width - 2 * x, innerHeight = height - 2 * y;
    assert.ok(Math.abs(innerWidth / innerHeight - horizontal / vertical) < 1e-8, value);
    assert.ok(x >= 0 && y >= 0 && (x === 0 || y === 0));
    const cover = coverImage(innerWidth, innerHeight, 800, 400);
    assert.equal(cover.overflowY, 0);
    assert.ok(cover.overflowX > 0);
    assert.ok(moveImagePosition({ x: .5, y: .5 }, cover, 20, 0).x < .5);
  }
  }
  assert.deepEqual(shapeInsets(400, 200, 'none'), { x: 0, y: 0 });
});

test('ovals, diamonds, arches and soft squares stretch to the full width and height of portrait and landscape frames', () => {
  for (const shape of ['ellipse', 'diamond', 'arch', 'soft-square']) {
  for (const [width, height] of [[400, 200], [200, 400], [240, 240]]) {
    assert.deepEqual(shapeInsets(width, height, shape), { x: 0, y: 0 });
  }
  assert.ok(decodeURIComponent(shapeMask(shape)).includes('preserveAspectRatio="none"'));
  }
});

test('active shapes suppress the canvas radius handle before inspecting the DOM', () => {
  const block = { clientId: 'a', name: 'core/image', attributes: { [ATTRIBUTE]: { shape: 'arch' } } };
  assert.deepEqual(readRadiusTargets(block, {}, { getBlockEditingMode: () => 'default' }, false, new Map()), []);
});

test('PHP and editor agree on shapes, masks and effective fit, with safe unshaped fallback', () => {
  const cases = [...IMAGE_SHAPES.map(s => s.value), null, 'invalid', {}, ['circle']];
  const code = String.raw`
    define('ABSPATH','/'); function add_action() {} function add_filter() {}
    function esc_attr($s) { return htmlspecialchars((string)$s, ENT_QUOTES); }
    function wp_json_encode($s) { return json_encode($s); }
    require $argv[1];
    $result=[];
    foreach(json_decode(stream_get_contents(STDIN),true) as $value) {
      $shape=PlaygroundPlugin\Canvas\image_shape($value);
      $block=(object)['name'=>'core/image','attributes'=>['canvas'=>['shape'=>$value,'fit'=>'contain','imagePosition'=>['x'=>.2,'y'=>.7]]]];
      $next=['desktop'=>1,'tablet'=>1,'mobile'=>1];
      $result[]=['shape'=>$shape,'mask'=>PlaygroundPlugin\Canvas\image_mask($shape),'html'=>PlaygroundPlugin\Canvas\canvas_item_open($block,0,$next,24)];
    }
    echo json_encode($result);
  `;
  const result = spawnSync('php', ['-r', code, file], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  JSON.parse(result.stdout).forEach((actual, i) => {
    const shape = imageShape(cases[i]);
    assert.equal(actual.shape, shape);
    assert.equal(decodeURIComponent(actual.mask), decodeURIComponent(shapeMask(shape) || 'none'));
    assert.ok(actual.html.includes('--canvas-fit:' + imageFit({ shape, fit: 'contain' }) + ';'));
    assert.equal(actual.html.includes('data-canvas-shape='), shape !== 'none');
    assert.ok(actual.html.includes(shape === 'none' ? '--canvas-image-position:50% 50%' : '--canvas-image-position:20% 70%'));
  });
});
