import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fillScreenSize, fillScreenRowHeight } from '../src/fill-screen.mjs';
import { canvasRows } from '../src/canvas-geometry.mjs';

test('screen rows fill the available height while preserving gaps, padding and taller content', () => {
  for (const count of [1, 12, 30]) for (const gap of [0, 24]) {
    const padding = { top: 16, bottom: 32 };
    const height = fillScreenRowHeight(1000, count, gap, padding, 24);
    const rows = canvasRows(padding.top, padding.bottom, count, gap, height);
    assert.ok(Math.abs(rows.height - Math.max(1000, 48 + count * 24 + (count - 1) * gap)) < .001);
    assert.ok(height >= 24);
  }
});

test('editor and frontend agree on disabled, preset, remembered, and malformed screen heights', () => {
  const attributes = [{}, { fillScreen: false, fillScreenHeight: 'medium' }, { fillScreen: true },
    ...['small', 'medium', 'large', 'invalid'].map(fillScreenHeight => ({ fillScreen: true, fillScreenHeight }))];
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const result = spawnSync('php', ['-r', String.raw`
    define('ABSPATH', '/'); function add_action() {} function add_filter() {}
    function wp_get_global_styles() { return []; }
    function esc_attr($value) { return htmlspecialchars((string)$value, ENT_QUOTES); }
    function wp_json_encode($value) { return json_encode($value); }
    function get_block_wrapper_attributes($value) { $GLOBALS['wrapper'] = $value; return ''; }
    require $argv[1];
    $result = [];
    foreach (json_decode($argv[2], true) as $attributes) {
      PlaygroundPlugin\Canvas\render_canvas($attributes, '', (object)['inner_blocks' => []]);
      $result[] = $GLOBALS['wrapper']['data-canvas-fill-screen'] ?? null;
    }
    echo json_encode($result);
  `, file, JSON.stringify(attributes)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const expected = attributes.map(attrs => fillScreenSize(attrs) ?? null);
  assert.deepEqual(expected, [null, null, 'large', 'small', 'medium', 'large', 'large']);
  assert.deepEqual(JSON.parse(result.stdout), expected);
});
