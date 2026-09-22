import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ATTRIBUTE, columnsForAlignment, resolveLayouts, savePlacement, rowHeightForWidth, rowPitch, normalizePlacement } from '../src/geometry.mjs';
import { canvasColumns, canvasRows, dragResizePlacement, dragCanvasPlacement, snapCanvasPlacement, savedCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveAutomaticContent } from '../src/automatic-content.mjs';
import { assertHorizontalSnap } from './helpers/snapped-placement.mjs';
import { mapImagePlacement } from '../src/image-layout.mjs';

const padding = { top: 37, bottom: 61, left: 32, right: 32 };
const geometry = (width, viewport = 'desktop', align = 'full', gap = 12, columnGap = gap) => {
  const inset = Math.max(padding.left, (width - 1440) / 2);
  const gridPadding = viewport === 'desktop' ? { ...padding, left: inset, right: inset } : padding;
  const contentWidth = width - gridPadding.left - gridPadding.right;
  return { ...canvasColumns(width, padding, inset, width - inset, columnGap, viewport, columnsForAlignment(viewport, align), gridPadding),
    ...canvasRows(padding.top, padding.bottom, 40, gap, rowHeightForWidth(contentWidth, viewport)),
    gap, viewport, referenceWidth: 1504, referenceColumns: columnsForAlignment('desktop', align) };
};
const block = saved => ({ clientId: 'image', name: 'core/image', attributes: { [ATTRIBUTE]: saved } });
const source = { gridColumns: 24, column: 3, columnSpan: 8, row: 3, rowSpan: 12 };
const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const element = { matches: () => false, hasAttribute: () => false, querySelector: () => null,
  classList: { contains: name => name === 'canvas__image' },
  getAttribute: name => name === 'data-canvas-auto' ? 'tablet mobile' : null };

function assertNearestFrame(p, ratio) {
  const { _rect: rect, _canvas: g } = p;
  assertHorizontalSnap(p);
  assert.ok(g.rows.some(row => Math.abs(row.start - rect.top) < .001));
  assert.ok(g.rows.some(row => Math.abs(row.end - rect.top - rect.height) < .001));
  const ideal = rect.width / ratio;
  const error = Math.abs(rect.height - ideal);
  const closest = Math.min(...g.rows.filter(row => row.end > rect.top).map(row => Math.abs(row.end - rect.top - ideal)));
  close(error, closest);
  assert.ok(error <= rowPitch(g) / 2 + .001 || ideal < g.rowHeight, `${JSON.stringify(rect)} missed ratio ${ratio}`);
}

test('square, portrait and landscape frames use the closest grid height from 320 through 3840px', () => {
  for (const ratio of [1, .96, 3 / 4, 16 / 9, 3]) for (const align of ['full', 'wide', undefined]) {
    for (const [gap, columnGap] of [[0, 0], [12, 12], [27, 8]]) for (const width of [320, 390, 480, 481, 600, 782, 783, 900, 1440, 2000, 2560, 3840]) {
      const mode = width <= 480 ? 'mobile' : width <= 782 ? 'tablet' : 'desktop';
      const saved = { desktop: { ...source, frameRatio: ratio },
        [mode]: { ...source, frameRatio: ratio, gridColumns: mode === 'mobile' ? 8 : mode === 'tablet' ? 12 : 24, column: 2, columnSpan: 6 } };
      const before = JSON.stringify(saved);
      const p = resolveLayouts([block(saved)], { [mode]: geometry(width, mode, align, gap, columnGap) }).image[mode];
      assertNearestFrame(p, ratio);
      assert.equal(JSON.stringify(saved), before);
    }
  }
});

test('capped cells stop growing while canvas and padding anchors keep their proportions outside the cap', () => {
  for (const edgeRight of [11, 'wide', 'padding', 'canvas']) {
    const saved = { desktop: { ...source, frameRatio: 1, anchors: { ...(source).anchors, left: 2, right: edgeRight } } };
    const frames = [1600, 2000, 2560, 3840].map(width => resolveLayouts([block(saved)], { desktop: geometry(width) }).image.desktop);
    for (const p of frames) assertNearestFrame(p, 1);
    if (typeof edgeRight === 'number' || edgeRight === 'wide') close(frames[0]._rect.width, frames.at(-1)._rect.width);
    else assert.ok(frames.at(-1)._rect.height > frames[0]._rect.height + 1000);
  }
});

test('automatic phone and tablet frames inherit the authored ratio independently of desktop measurement width', () => {
  for (const ratio of [1, .96, 3 / 4, 16 / 9]) for (const [mode, width] of [['mobile', 320], ['mobile', 480], ['tablet', 481], ['tablet', 782]]) {
    const target = geometry(width, mode);
    const saved = { desktop: { ...source, frameRatio: ratio } };
    const outputs = [320, 1504, 3840].map(desktopWidth => {
      const all = { desktop: geometry(desktopWidth), [mode]: target };
      const layouts = resolveLayouts([block(saved)], all).image;
      const automatic = resolveAutomaticContent([element], mode, target, [layouts[mode]], [layouts.desktop]);
      const p = resolveLayouts([block(saved)], { ...all, [mode]: { ...target, automatic } }).image[mode];
      assertNearestFrame(p, ratio);
      close(p.frameRatio, ratio);
      const moved = dragCanvasPlacement(p, mode, 'move', 0, 36, { columnSpan: 1, rowSpan: 1 });
      const savedMove = savePlacement(saved, { ...layouts, [mode]: p }, mode, moved);
      close(savedMove[mode].frameRatio, ratio);
      return p._rect;
    });
    assert.deepEqual(outputs[0], outputs[1]);
    assert.deepEqual(outputs[1], outputs[2]);
  }
});

test('resizing captures the new frame but moving preserves the target ratio and other viewports', () => {
  const saved = { desktop: { ...source, frameRatio: 1 }, mobile: { gridColumns: 8, columnSpan: 6, rowSpan: 6, frameRatio: 3 / 4 } };
  const measured = { desktop: geometry(1200) };
  const initial = resolveLayouts([block(saved)], measured).image;
  const minimum = { columnSpan: 1, rowSpan: 1 };
  const preview = dragResizePlacement(initial.desktop, 'desktop', 'se', 100, -80, minimum);
  const resized = snapCanvasPlacement(preview, 'desktop', minimum);
  const committed = savePlacement(saved, initial, 'desktop', resized);
  close(committed.desktop.frameRatio, resized._rect.width / resized._rect.height);
  assert.deepEqual(committed.mobile, saved.mobile);
  const reopened = resolveLayouts([block(JSON.parse(JSON.stringify(committed)))], measured).image;
  assert.deepEqual(reopened.desktop._rect, resized._rect);
  const moved = dragCanvasPlacement(reopened.desktop, 'desktop', 'move', 0, 40, minimum);
  const afterMove = savePlacement(committed, reopened, 'desktop', moved);
  close(afterMove.desktop.frameRatio, committed.desktop.frameRatio);
  for (const width of [900, 2000, 3840, 1200]) assertNearestFrame(resolveLayouts([block(afterMove)], { desktop: geometry(width) }).image.desktop, committed.desktop.frameRatio);
});

test('cell-only images derive a stable reference ratio without altering source data or consulting the gesture lock', () => {
  for (const rowSpan of [10, 12]) {
    const saved = { desktop: { ...source, rowSpan } };
    const before = JSON.stringify(saved);
    const frames = [320, 1200, 2000, 3840].map(width => resolveLayouts([block(saved)], { desktop: geometry(width) }).image.desktop);
    for (const p of frames) { close(p.frameRatio, frames[0].frameRatio); assertNearestFrame(p, p.frameRatio); }
    const locked = resolveLayouts([block({ ...saved, aspectRatio: 99 })], { desktop: geometry(1200) }).image.desktop;
    assert.deepEqual(locked._rect, frames[1]._rect);
    assert.equal(JSON.stringify(saved), before);
  }
});

test('PHP and JavaScript retain valid per-viewport frame ratios and ignore invalid values', () => {
  const values = [1, .96, 16 / 9, 0, -1, null].map(frameRatio => ({ ...source, frameRatio }));
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const code = `define('ABSPATH','/'); function add_action() {} function add_filter() {} require $argv[1]; echo json_encode(array_map(fn($p) => PlaygroundPlugin\\Canvas\\placement($p,'desktop',1,1),json_decode(stream_get_contents(STDIN),true)));`;
  const result = spawnSync('php', ['-r', code, file], { input: JSON.stringify(values), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), values.map(value => normalizePlacement(value, 'desktop')));
});
