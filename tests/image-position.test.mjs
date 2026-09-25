import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { coverImage, imagePosition, moveImagePosition, imageWasReplaced, roundedImagePath } from '../src/image-position.mjs';
import { ATTRIBUTE, resolveLayouts, savePlacement, duplicateLayout, layoutVariables } from '../src/geometry.mjs';

test('cover geometry allows only the overflowing axis and never exposes empty space', () => {
  const landscape = coverImage(200, 200, 1200, 600);
  assert.deepEqual(landscape, { width: 400, height: 200, overflowX: 200, overflowY: 0 });
  assert.deepEqual(moveImagePosition({ x: .5, y: .3 }, landscape, 50, 900), { x: .25, y: .3 });
  assert.deepEqual(moveImagePosition({ x: .5, y: .3 }, landscape, -500, -900), { x: 1, y: .3 });
  const portrait = coverImage(200, 100, 400, 800);
  assert.deepEqual(moveImagePosition({ x: .8, y: .5 }, portrait, 90, 60), { x: .8, y: .3 });
  assert.equal(coverImage(0, 100, 400, 800), null);
  assert.equal(coverImage(100, 100, 0, 0), null);
  assert.deepEqual(moveImagePosition({ x: .2, y: .7 }, coverImage(100, 100, 200, 200), 500, 500), { x: .2, y: .7 });
});

test('rotated and zoomed images track the same screen-space pointer movement', () => {
  const cover = coverImage(200, 200, 1200, 600);
  const start = { x: .5, y: .5 };
  const ordinary = moveImagePosition(start, cover, 40, 0);
  for (const rotation of [-90, -35, 0, 45, 90, 180]) for (const scale of [.35, .5, 1, 1.5]) {
    const angle = rotation * Math.PI / 180;
    const moved = moveImagePosition(start, cover, Math.cos(angle) * 40 * scale, Math.sin(angle) * 40 * scale, rotation, scale);
    assert.ok(Math.abs(moved.x - ordinary.x) < 1e-10);
    assert.equal(moved.y, .5);
  }
});

test('position survives layout changes, duplication and serialization without creating viewport overrides', () => {
  const raw = { desktop: { column: 2, row: 2, columnSpan: 8, rowSpan: 6 }, imagePosition: { x: .2, y: .8 } };
  const layout = resolveLayouts([{ clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: raw } }]).image;
  assert.equal(layoutVariables(layout)['--canvas-image-position'], '20% 80%');
  assert.equal(layoutVariables({ ...layout, fill: false })['--canvas-image-position'], '50% 50%');
  assert.deepEqual(duplicateLayout(layout, raw).imagePosition, raw.imagePosition);
  assert.deepEqual(savePlacement(raw, layout, 'desktop', layout.desktop).imagePosition, raw.imagePosition);
  assert.equal(raw.mobile, undefined);
  assert.deepEqual(imagePosition(JSON.parse(JSON.stringify(raw)).imagePosition), raw.imagePosition);
  assert.deepEqual(imagePosition(undefined), { x: .5, y: .5 });
});

test('media replacement resets the point while image resolution changes retain it', () => {
  const before = { id: 12, url: '/photo-large.jpg', sizeSlug: 'large' };
  assert.equal(imageWasReplaced(before, { id: 13, url: '/other.jpg' }), true);
  assert.equal(imageWasReplaced(before, { id: 12, url: '/photo-full.jpg', sizeSlug: 'full' }), false);
  assert.equal(imageWasReplaced({ url: '/remote.jpg' }, { url: '/other.jpg' }), true);
  assert.equal(imageWasReplaced(before, { style: {} }), false);
});

test('rounded cutouts support unequal corners, ellipses, and oversized radii without invalid paths', () => {
  for (const corners of [['0', '0', '0', '0'], ['20px', '40px', '0', '10px'], ['50%', '50%', '50%', '50%'], ['9999px', '9999px', '9999px', '9999px']]) {
    const path = roundedImagePath(200, 100, corners);
    assert.ok(!/NaN|Infinity/.test(path));
    assert.ok(path.endsWith(' Z'));
  }
  assert.ok(roundedImagePath(200, 100, Array(4).fill('50%')).includes('A100 50'));
  assert.ok(roundedImagePath(200, 100, Array(4).fill('9999px')).includes('A50 50'));
});

test('PHP and JavaScript normalize saved positions identically', () => {
  const values = [null, {}, { x: .2, y: .9 }, { x: -4, y: 9 }, { x: '0.1', y: null }, { x: true, y: [] }];
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const code = `define('ABSPATH','/'); function add_action() {} function add_filter() {} require $argv[1]; echo json_encode(array_map('PlaygroundPlugin\\\\Canvas\\\\image_position',json_decode(stream_get_contents(STDIN),true)));`;
  const result = spawnSync('php', ['-r', code, file], { input: JSON.stringify(values), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), values.map(imagePosition));
});
