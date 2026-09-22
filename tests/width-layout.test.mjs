import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ATTRIBUTE, COLUMNS, columnsForAlignment, projectPlacement, resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { canvasColumns, canvasRows, dragCanvasPlacement, savedCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveCanvasLayouts } from '../src/canvas-groups.mjs';

const padding = { top: 24, right: 32, bottom: 24, left: 32 };
const geometry = (align, width = align === 'full' ? 1800 : align === 'wide' ? 1200 : 640) => Object.fromEntries(Object.keys(COLUMNS).map(mode => [mode, {
  ...canvasColumns(width, padding, Math.max(0, (width - 1200) / 2), Math.min(width, (width + 1200) / 2), 12, mode, columnsForAlignment(mode, align)),
  ...canvasRows(24, 24, 24, 12), gap: 12,
}]));
const block = (saved, name = 'core/image') => ({ clientId: 'a', name, attributes: { [ATTRIBUTE]: saved } });

test('width settings bound the content grid inside native padding', () => {
  for (const [align, max] of [[undefined, 12], ['wide', 18], ['full', 24]]) {
    for (const width of [390, 640, 1440, 2560]) {
      const grids = geometry(align, width);
      for (const [mode, count] of [['desktop', max], ['tablet', 12], ['mobile', 12]]) {
        const g = grids[mode];
        assert.equal(g.contentColumns.length, count);
        assert.equal(g.gridColumns, count);
        assert.equal(g.contentColumns[0].start, padding.left);
        assert.ok(Math.abs(g.contentColumns.at(-1).end - (width - padding.right)) < .001);
        assert.ok(g.columns.every(c => c.end > c.start));
      }
    }
  }
});

test('half-width items scale 12 to 9 to 6 without altering saved overrides', () => {
  const saved = { desktop: { gridColumns: 24, column: 7, columnSpan: 12, row: 2, rowSpan: 4, rotation: 15 },
    tablet: { gridColumns: 12, column: 2, columnSpan: 6, row: 8, rowSpan: 3 },
    mobile: { gridColumns: 8, column: 2, columnSpan: 4, row: 12, rowSpan: 2 } };
  const original = JSON.stringify(saved);
  const first = resolveLayouts([block(saved)], geometry('full')).a;
  for (const align of ['wide', undefined, 'full', undefined, 'wide', 'full']) {
    const next = resolveLayouts([block(saved)], geometry(align)).a;
    assert.equal(next.desktop.columnSpan, columnsForAlignment('desktop', align) / 2);
    assert.equal(next.desktop.rotation, 15);
    assert.equal(next.tablet._base.columnSpan, 6);
    assert.equal(next.mobile._base.columnSpan, 6);
    if (align === 'full') assert.deepEqual(next.desktop._rect, first.desktop._rect);
    assert.equal(JSON.stringify(saved), original);
  }
});

test('odd placements project directly from their authored width without double rounding', () => {
  for (const sourceCount of [12, 18, 24]) for (let column = 1; column <= sourceCount; column++) {
    const saved = { desktop: { gridColumns: sourceCount, column, columnSpan: 1, row: 3, rowSpan: 2 } };
    for (const align of ['full', 'wide', undefined]) {
      const actual = resolveLayouts([block(saved)], geometry(align)).a.desktop;
      assert.deepEqual(savedCanvasPlacement(actual), projectPlacement(saved.desktop, 'desktop', 'desktop', undefined, columnsForAlignment('desktop', align)));
    }
  }
});

test('an edit at content width saves its density and reopens consistently at every width', () => {
  const saved = { desktop: { gridColumns: 24, column: 1, columnSpan: 12, row: 2, rowSpan: 4 } };
  const current = resolveLayouts([block(saved)], geometry()).a;
  const edited = dragCanvasPlacement(current.desktop, 'desktop', 'move', 110, 36, { columnSpan: 1, rowSpan: 1 });
  const next = JSON.parse(JSON.stringify(savePlacement(saved, current, 'desktop', edited)));
  assert.equal(next.desktop.gridColumns, 12);
  assert.deepEqual(resolveLayouts([block(next)], geometry()).a.desktop._rect, edited._rect);
  const before = JSON.stringify(next);
  for (const align of ['wide', 'full', undefined]) resolveLayouts([block(next)], geometry(align));
  assert.equal(JSON.stringify(next), before);
  assert.deepEqual(resolveLayouts([block(next)], geometry()).a.desktop._rect, edited._rect);
});

test('wide guides remain exact anchors and survive width switches', () => {
  const saved = { desktop: { gridColumns: 24, column: 1, columnSpan: 24, row: 1, rowSpan: 4, anchors: { left: 'wide', right: 'wide' } } };
  for (const align of ['full', 'wide', undefined, 'full']) {
    const g = geometry(align);
    const p = resolveLayouts([block(saved)], g).a.desktop;
    assert.equal(p._rect.left, g.desktop.wideStart);
    assert.equal(p._rect.left + p._rect.width, g.desktop.wideEnd);
    assert.equal(p.gridColumns, columnsForAlignment('desktop', align));
  }
});

test('group bounds and translated children return exactly after width switches', () => {
  const child = block({ desktop: { gridColumns: 18, column: 3, columnSpan: 7, row: 3, rowSpan: 4 }, offset: { desktop: { x: .04, y: 2 } } });
  const group = { clientId: 'group', name: 'core/group', attributes: { [ATTRIBUTE]: { group: 1 } }, innerBlocks: [child] };
  const original = JSON.stringify(group);
  const before = resolveCanvasLayouts([group], geometry('wide'));
  for (const align of [undefined, 'full', 'wide']) {
    const next = resolveCanvasLayouts([group], geometry(align));
    assert.equal(next.group.desktop.gridColumns, columnsForAlignment('desktop', align));
    if (align === 'wide') for (const id of ['a', 'group']) assert.deepEqual(next[id].desktop._rect, before[id].desktop._rect);
    assert.equal(JSON.stringify(group), original);
  }
});

test('pointer resizing snaps to wide guides at grid boundaries', () => {
  const g = geometry('full');
  g.desktop = { ...g.desktop, ...canvasColumns(1800, padding, 300, 1500, 12, 'desktop', 24, {left:300,right:300}) };
  const p = resolveLayouts([block({ desktop: { column: 2, columnSpan: 20 } })], g).a.desktop;
  const next = snapCanvasPlacement({ ...p, free: { x: 301 / 1800, width: 1198 / 1800, y: 0, ratio: 2 }, _rect: { ...p._rect, left: 301, width: 1198 } }, 'desktop');
  assert.equal(next._base.anchors?.left, 'wide');
  assert.equal(next._base.anchors?.right, 'wide');
  assert.equal(next._rect.left, 300);
  assert.equal(next._rect.width, 1200);
});

test('PHP and JavaScript share width limits and project saved placements identically', () => {
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const cases = [undefined, 'wide', 'full'].flatMap(align => Object.keys(COLUMNS).flatMap(mode => [12, 18, 24].map(gridColumns => ({
    align: align ?? '', mode, value: { gridColumns, column: 3, columnSpan: 7, row: 1, rowSpan: 4, anchors: { left: 'wide', right: 9 } },
  }))));
  const code = `define('ABSPATH','/'); function add_action() {} function add_filter() {} require $argv[1]; echo json_encode(array_map(function($c) { $count=PlaygroundPlugin\\Canvas\\columns_for_alignment($c['mode'],$c['align']); return ['count'=>$count,'placement'=>PlaygroundPlugin\\Canvas\\project_placement($c['value'],'desktop',$c['mode'],'',$count)]; },json_decode(stream_get_contents(STDIN),true)));`;
  const result = spawnSync('php', ['-r', code, file], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), cases.map(c => ({ count: columnsForAlignment(c.mode, c.align), placement: projectPlacement(c.value, 'desktop', c.mode, undefined, columnsForAlignment(c.mode, c.align)) })));
});
