import test from 'node:test';
import assert from 'node:assert/strict';
import { insertionLayout } from '../src/insertion-layout.mjs';
import { ATTRIBUTE, resolveLayouts } from '../src/geometry.mjs';
import { canvasColumns, canvasRows } from '../src/canvas-geometry.mjs';
import { withInsertionDefaults } from '../src/insertion-defaults.mjs';
import { droppedLayouts, placementRectangle } from '../src/drop-layout.mjs';

const block = (id, layout = {}, name = 'core/paragraph') => ({ clientId: id, name, attributes: { [ATTRIBUTE]: layout } });
const canvas = { ...canvasColumns(996,{top:0,bottom:0,left:0,right:0},0,996,12,'desktop'),...canvasRows(0,0,12,12),gap:12 };
const metrics = { ...canvas, mode:'desktop', geometry:{desktop:canvas} };

test('full-width canvas insertion anchors all block types to wide width without stretching them', () => {
  for (const width of [1440, 1920, 3840]) {
    const padding = { top: 0, bottom: 0, left: 24, right: 24 };
    const wideStart = (width - 996) / 2;
    const desktop = { ...canvasColumns(width, padding, wideStart, width - wideStart, 12, 'desktop', 24,
      { ...padding, left: wideStart, right: wideStart }), ...canvasRows(0, 0, 12, 12), gap: 12, align: 'full', hasWide: true };
    const measured = { ...desktop, mode: 'desktop', geometry: { desktop } };
    for (const name of ['core/heading', 'core/paragraph', 'core/image', 'core/buttons']) {
      const incoming = block('new', {}, name);
      const layout = insertionLayout([], incoming, 'desktop', measured);
      assert.equal(layout.desktop.anchors?.left, 'wide');
      assert.equal(layout.desktop.columnSpan, name === 'core/buttons' ? 4 : name === 'core/paragraph' ? 10 : 8);
      const reopened = resolveLayouts([block('new', JSON.parse(JSON.stringify(layout)), name)], measured.geometry).new.desktop;
      assert.equal(reopened._rect.left, wideStart);
      assert.ok(reopened._rect.width < 996);
    }
  }
});

test('canvas insertion follows the lowest occupied block, independent of source order and selection', () => {
  const existing = [block('low', { desktop: { row: 20, rowSpan: 4 } }), block('high', { desktop: { row: 2, rowSpan: 2 } })];
  const incoming = block('new');
  const before = structuredClone(existing);
  const layout = insertionLayout([...existing, incoming], incoming, 'desktop', metrics);
  assert.equal(layout.desktop.row, 24);
  assert.equal(layout.desktop.anchors?.top, undefined);
  assert.equal(layout.mobile, undefined);
  assert.equal(layout.tablet, undefined);
  assert.deepEqual(existing, before);
});

test('empty padded canvases start at their content edge and saved placement survives reopening', () => {
  const padding = { top: 37, right: 53, bottom: 61, left: 29 };
  const desktop = { ...canvasColumns(1200, padding, 100, 1100, 12, 'desktop'), ...canvasRows(37, 61, 30, 12), gap: 12 };
  const incoming = block('new');
  const layout = insertionLayout([], incoming, 'desktop', { ...desktop, geometry: { desktop } });
  const reopened = resolveLayouts([block('new', JSON.parse(JSON.stringify(layout)))], { desktop }).new.desktop;
  assert.equal(layout.desktop.row, 1);
  assert.equal(reopened._rect.top, 37);
  assert.equal(reopened._rect.left, 29);
  assert.ok(!JSON.stringify(layout).includes('_'));
});

test('mobile insertion appends to the mobile composition while keeping a desktop fallback', () => {
  const existing = [block('old', { desktop: { row: 20, rowSpan: 4 }, mobile: { row: 3, rowSpan: 2 } })];
  const layout = insertionLayout(existing, block('new'), 'mobile', metrics);
  assert.equal(layout.mobile.row, 5);
  assert.equal(layout.desktop.row, 24);
  assert.equal(layout.tablet, undefined);
});

test('context insertion uses the requested cell and clamps at the right edge', () => {
  const incoming = block('new', {}, 'core/buttons');
  const layout = insertionLayout([], incoming, 'desktop', metrics, { x: 99999, y: 144 });
  assert.equal(layout.desktop.row, 5);
  const placed=resolveLayouts([block('new',layout,'core/buttons')],metrics.geometry).new.desktop;
  assert.equal(placed.column + placed.columnSpan - 1, 24);
  assert.equal(layout.desktop.columnSpan, 4);
  assert.equal(layout.desktop.rowSpan, 2);
  assert.equal(layout.mobile, undefined);
});

test('appending beyond the row limit is rejected', () => {
  assert.equal(insertionLayout([block('full', { desktop: { row: 495, rowSpan: 6 } })], block('new'), 'desktop', metrics), null);
});

test('new Buttons use their 4 by 2 minimum across insertion paths and viewports', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    const measured = { ...canvasColumns(mode === 'desktop' ? 996 : 360, canvas.padding, 0, 360, 12, mode), ...canvasRows(0, 0, 20, 12), gap: 12 };
    const viewMetrics = { ...measured, mode, geometry: { desktop: canvas, [mode]: measured } };
    const incoming = { ...block('new', {}, 'core/buttons'), innerBlocks: [{ name: 'core/button', attributes: { text: '' } }] };
    const initialized = withInsertionDefaults(incoming, mode, viewMetrics);
    assert.deepEqual(initialized.attributes.layout, { type: 'flex' });
    assert.strictEqual(initialized.innerBlocks, incoming.innerBlocks);
    const existing = [block('old', { desktop: { row: 3, rowSpan: 5 }, [mode]: { row: 3, rowSpan: 5 } })];
    const appended = insertionLayout(existing, incoming, mode, viewMetrics);
    assert.equal(appended[mode].row, 8);
    assert.equal(appended[mode].anchors?.left, 'padding');
    assert.equal(appended[mode].anchors?.bottom, undefined);
    for (const layout of [appended,
      insertionLayout(existing, incoming, mode, viewMetrics, { x: 84, y: 360 }),
      droppedLayouts(existing, [incoming], mode, { x: 84, y: 360 }, viewMetrics).new,
    ]) {
      assert.equal(layout[mode].columnSpan, 4);
      assert.equal(layout[mode].rowSpan, 2);
      assert.equal(layout.fill, undefined);
      assert.equal(layout.desktop.columnSpan, 4);
      assert.equal(layout.desktop.rowSpan, 2);
    }
    const authored = { ...incoming, attributes: { layout: { type: 'flex', justifyContent: 'center' }, [ATTRIBUTE]: { desktop: { columnSpan: 10, rowSpan: 4 } } } };
    assert.strictEqual(withInsertionDefaults(authored, mode, viewMetrics), authored);
  }
});

for (const [name, content, fill] of [
  ['core/heading', 'This is a heading', true],
  ['core/paragraph', 'A thoughtful composition keeps its character across different screens. This longer paragraph should stay alongside the heading while there is enough room, then widen only as much as it needs.', false],
]) test(`new ${name} blocks share text, fitting, and default sizing across insertion paths`, () => {
  const incoming = block('new', {}, name);
  const initialized = withInsertionDefaults(incoming, 'desktop', metrics);
  assert.equal(initialized.attributes.content, content);
  assert.equal(incoming.attributes.content, undefined);
  for (const layout of [
    insertionLayout([], incoming, 'desktop', metrics),
    insertionLayout([], incoming, 'desktop', metrics, { x: 84, y: 144 }),
    droppedLayouts([], [incoming], 'desktop', { x: 84, y: 144 }, metrics).new,
  ]) {
    assert.equal(layout.fill, fill || undefined);
    assert.equal(layout.desktop.columnSpan, name === 'core/paragraph' ? 10 : 8);
    assert.equal(layout.desktop.rowSpan, name === 'core/paragraph' ? 3 : 2);
    assert.equal(layout.mobile, undefined);
    assert.equal(layout.tablet, undefined);
  }
});

test('images use the same near-square measured size for toolbar, context, and drop insertion', () => {
  const incoming = block('new', {}, 'core/image');
  const layouts = [
    insertionLayout([], incoming, 'desktop', metrics),
    insertionLayout([], incoming, 'desktop', metrics, { x: 84, y: 144 }),
    droppedLayouts([], [incoming], 'desktop', { x: 84, y: 144 }, metrics).new,
  ];
  const sizes = layouts.map((layout) => {
    const { width, height } = placementRectangle(layout.desktop, metrics);
    assert.ok(Math.abs(width - height) <= 18);
    return [width, height];
  });
  assert.deepEqual(sizes[0], sizes[1]);
  assert.deepEqual(sizes[0], sizes[2]);
});

test('mobile defaults fit the current grid and keep a complete desktop fallback below siblings', () => {
  const mobile = { ...canvasColumns(360, { top: 0, bottom: 0, left: 0, right: 0 }, 0, 360, 12, 'mobile'), ...canvasRows(0, 0, 12, 12), gap: 12 };
  const desktopAtPhoneWidth = { ...mobile, ...canvasColumns(360, mobile.padding, 0, 360, 12, 'desktop'), referenceWidth: 996 };
  const mobileMetrics = { ...mobile, mode: 'mobile', geometry: { desktop: desktopAtPhoneWidth, mobile } };
  const existing = [block('old', { desktop: { row: 10, rowSpan: 6 }, mobile: { row: 2, rowSpan: 2 } })];
  for (const name of ['core/heading', 'core/paragraph', 'core/image']) {
    const incoming = block('new', {}, name);
    const layout = insertionLayout(existing, incoming, 'mobile', mobileMetrics);
    assert.equal(layout.desktop.row, 16);
    assert.equal(layout.mobile.row, 4);
    assert.equal(layout.mobile.columnSpan, name === 'core/image' ? 6 : name === 'core/paragraph' ? 10 : 8);
    assert.equal(layout.tablet, undefined);
    const reopened = resolveLayouts([...existing, block('new', JSON.parse(JSON.stringify(layout)), name)], mobileMetrics.geometry).new;
    assert.equal(reopened.desktop.row, 16);
    assert.equal(reopened.mobile.row, 4);
    if (name !== 'core/image') assert.equal(layout.mobile.rowSpan, name === 'core/paragraph' ? 3 : 2);
    else {
      assert.ok(Math.abs(reopened.mobile._rect.width - reopened.mobile._rect.height) <= 18);
      const desktop = resolveLayouts([block('new', layout, name)], { desktop: canvas }).new.desktop._rect;
      assert.ok(Math.abs(desktop.width - desktop.height) <= 18);
    }
  }
});

test('insertion defaults preserve authored layouts and supplied heading text and sizing', () => {
  const authored = block('old', { desktop: { columnSpan: 4, rowSpan: 2 } }, 'core/heading');
  assert.strictEqual(withInsertionDefaults(authored, 'desktop', metrics), authored);
  const incoming = { ...block('new', {}, 'core/heading'), attributes: { content: 'Keep this heading', fitText: true } };
  const initialized = withInsertionDefaults(incoming, 'desktop', metrics);
  assert.equal(initialized.attributes.content, 'Keep this heading');
  assert.equal(initialized.attributes.fitText, true);
  assert.equal(initialized.attributes[ATTRIBUTE].fill, undefined);
  const emptyRichText = { toString: () => '' };
  assert.equal(withInsertionDefaults({ ...incoming, attributes: { content: emptyRichText } }, 'desktop', metrics).attributes.content, 'This is a heading');
});


test('video insertion uses a landscape frame without image attributes and preserves authored video settings', () => {
  const incoming = { clientId: 'video', name: 'core/video', attributes: { src: '/movie.mp4', poster: '/poster.jpg', controls: true, tracks: [{ src: '/captions.vtt', kind: 'captions' }] } };
  const inserted = withInsertionDefaults(incoming, 'desktop', metrics);
  assert.ok(Math.abs(inserted.attributes.canvas.desktop.frameRatio - 16 / 9) < 0.00001);
  assert.equal(inserted.attributes.sizeSlug, undefined);
  assert.equal(inserted.attributes.src, incoming.attributes.src);
  assert.deepEqual(inserted.attributes.tracks, incoming.attributes.tracks);
  assert.deepEqual(withInsertionDefaults(inserted, 'mobile', metrics), inserted);
  const layout = resolveLayouts([inserted], metrics.geometry).video;
  assert.equal(layout.fill, true);
  assert.equal(layout.shape, 'none');
  assert.equal(layout.video, true);
});
