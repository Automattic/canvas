import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { canvasColumns, canvasRows, canvasContentRows, mapCanvasPlacement, dragMovePlacement } from '../src/canvas-geometry.mjs';
import { resolveLayouts } from '../src/geometry.mjs';
import { responsiveRowMetrics } from '../src/section-layout.mjs';
import { visibleRowCount, resizeCanvasRows, preserveRowsOnResize } from '../src/row-resize.mjs';

const padding = { top: 37, bottom: 61, left: 20, right: 20 };
const geometry = (height = 0, rows = 8, mode = 'desktop') => ({
  ...canvasColumns(1000, padding, 40, 960, 12, mode),
  ...canvasRows(padding.top, padding.bottom, rows, 12, 24, height),
  gap: 12, viewport: mode, referenceWidth: 1440, referenceColumns: 24,
});
const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);

test('viewport minimum includes padding, extends cells, and leaves authored rows and frames unchanged', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    const ordinary = geometry(0, 8, mode), full = geometry(900, 8, mode);
    assert.equal(full.height, 900);
    assert.equal(full.coreRows, 8);
    assert.equal(full.contentEnd, 839);
    assert.ok(full.rows.length > ordinary.rows.length);
    assert.equal(full.rows.at(-1).end, 900);
    for (let i = 0; i < full.before + full.coreRows; i++) assert.deepEqual(full.rows[i], ordinary.rows[i]);
    for (const value of [
      { row: 2, rowSpan: 3, column: 3, columnSpan: 4 },
      { row: 2, rowSpan: 3, free: { x: .1, y: 2, width: .2, ratio: 1.5 }, anchors: { left: 'wide' } },
    ]) {
      assert.deepEqual(mapCanvasPlacement(value, mode, full)._rect, mapCanvasPlacement(value, mode, ordinary)._rect);
    }
    assert.equal(geometry(900, 40, mode).height, geometry(0, 40, mode).height);
  }
});

test('responsive row calculation retains minimum height without changing cell pitch', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    const all = Object.fromEntries(['desktop', 'tablet', 'mobile'].map(key => [key, geometry(900, 8, key)]));
    const ordinary = Object.fromEntries(['desktop', 'tablet', 'mobile'].map(key => [key, geometry(0, 8, key)]));
    const full = responsiveRowMetrics([], mode, all);
    const normal = responsiveRowMetrics([], mode, ordinary);
    assert.equal(full.height, 900);
    assert.equal(full.minimumHeight, 900);
    assert.equal(full.rowHeight, normal.rowHeight);
    assert.equal(full.gap, normal.gap);
    assert.equal(full.coreRows, normal.coreRows);
  }
});

test('full-height images follow viewport changes and content growth without saving geometry', () => {
  const blocks = [{ clientId: 'image', name: 'core/image', attributes: { canvas: { desktop: {
    column: 1, columnSpan: 6, row: 1, rowSpan: 8, gridColumns: 24, fillHeight: true,
  } } }, innerBlocks: [] }];
  const original = JSON.stringify(blocks);
  for (const height of [600, 900, 1100, 0]) {
    for (const rows of [8, 40]) {
      const g = geometry(height, rows);
      const image = resolveLayouts(blocks, { desktop: g }).image.desktop;
      assert.equal(image._rect.top, 0);
      assert.equal(image._rect.height, g.height);
      assert.equal(image._canvas.coreRows, rows);
    }
  }
  assert.equal(JSON.stringify(blocks), original);
});

test('blocks can move into the added space without losing the viewport minimum', () => {
  const g = geometry(900);
  const initial = mapCanvasPlacement({ column: 1, columnSpan: 4, row: 2, rowSpan: 2 }, 'desktop', g);
  const moved = dragMovePlacement(initial, 'desktop', 0, 400);
  assert.equal(moved._canvas.minimumHeight, 900);
  assert.equal(moved._canvas.height, 900);
  close(moved._rect.height, initial._rect.height);
  close(moved._rect.top, initial._rect.top + 400);
});

test('manual resizing starts at the visible edge and previews do not mutate the full-height source', () => {
  const g = geometry(914); // Exactly 23 manual rows, including padding.
  assert.equal(visibleRowCount(g, 8), 23);
  assert.equal(visibleRowCount(geometry(), 8), 8);
  const desktop = mapCanvasPlacement({ column: 1, columnSpan: 4, row: 2, rowSpan: 2 }, 'desktop', g);
  const layouts = { item: { desktop } }, saved = JSON.stringify(layouts);
  for (const symmetric of [false, true]) {
    const next = resizeCanvasRows(layouts, 'desktop', visibleRowCount(g, 8), 3, 2, symmetric);
    assert.equal(next.rows, symmetric ? 27 : 25);
    const preview = preserveRowsOnResize(layouts, 'desktop', next.offset, next.rows);
    if (symmetric) {
      assert.equal(preview.item._canvas.minimumHeight, 0);
      close(preview.item._rect.top, desktop._rect.top + 72);
    }
    assert.equal(JSON.stringify(layouts), saved);
  }
});

test('PHP renders full height only when enabled and keeps authored row minimums', () => {
  const result = spawnSync('php', ['-r', String.raw`
    define('ABSPATH', '/');
    function add_action() {} function add_filter() {}
    function esc_attr($v) { return htmlspecialchars((string)$v, ENT_QUOTES); }
    function wp_json_encode($v) { return json_encode($v); }
    function wp_get_global_styles() { return []; }
    function get_block_wrapper_attributes($attrs) { return 'class="wp-block-tabor-canvas '.$attrs['class'].'"'; }
    require $argv[1];
    $block=(object)['inner_blocks'=>[],'inner_content'=>[]];
    foreach ([false,true] as $full) echo PlaygroundPlugin\Canvas\render_canvas(['fullHeight'=>$full,'desktopRows'=>8], '', $block)."\n";
  `, new URL('../includes/canvas.php', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const [ordinary, full] = result.stdout.trim().split('\n');
  assert.ok(!ordinary.includes('is-full-height'));
  assert.ok(full.includes('is-full-height'));
  assert.match(full, /data-canvas-desktop-minimum="8"/);
});


test('cell overlay fills the viewport minimum and clips at the content padding edge', () => {
  for (const height of [0, 900, 914, 1100]) {
    const g = geometry(height);
    const cells = canvasContentRows(g);
    assert.equal(cells[0].start, padding.top);
    assert.ok(cells.every(cell => cell.start >= padding.top && cell.end <= g.height - padding.bottom));
    if (height) {
      assert.ok(cells.length > g.coreRows);
      assert.ok(cells.at(-1).end >= g.contentEnd - g.gap);
      assert.ok(cells.every(cell => cell.end - cell.start <= g.rowHeight));
    } else {
      assert.deepEqual(cells, g.rows.slice(g.before, g.before + g.coreRows));
    }
    assert.equal(g.coreRows, 8);
  }
});
