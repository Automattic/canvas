import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, rowHeightForWidth } from '../src/placement.mjs';
import { canvasColumns, canvasRows, occupiedRows, nudgeCanvasPlacement, dragMovePlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { sectionRows, responsiveRowMetrics } from '../src/section-layout.mjs';

const minimums = { desktop: 12, tablet: 1, mobile: 1 };
const centered = { column: 9, row: 3, columnSpan: 8, rowSpan: 8, gridColumns: 24, frameRatio: 1.04733 };
const bottom = { column: 1, row: 5, columnSpan: 8, rowSpan: 8, gridColumns: 24,
  frameRatio: 1.08775, anchors: { left: 'wide' } };
const block = desktop => ({ clientId: 'image', name: 'core/image', attributes: { canvas: { desktop } } });
const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
function geometry(width, blocks, mins = minimums) {
  const rows = sectionRows(blocks, mins);
  const padding = { top: 0, bottom: 0, left: 50, right: 50 };
  const inset = Math.max(50, (width - 1340) / 2);
  const all = Object.fromEntries(Object.keys(COLUMNS).map(mode => {
    const gridPadding = mode === 'desktop' ? { ...padding, left: inset, right: inset } : padding;
    return [mode, { ...canvasColumns(width, padding, inset, width - inset, 24, mode, COLUMNS[mode], gridPadding),
      ...canvasRows(0, 0, rows[mode], 24, rowHeightForWidth(width - gridPadding.left - gridPadding.right, mode)),
      gap: 24, viewport: mode, referenceWidth: 1440, referenceColumns: 24 }];
  }));
  for (const mode of Object.keys(COLUMNS)) all[mode] = responsiveRowMetrics(blocks, mode, all);
  return all;
}

test('responsive sections inherit the authored row structure and respect viewport overrides', () => {
  assert.deepEqual(sectionRows([block(centered)], minimums), { desktop: 12, tablet: 12, mobile: 12 });
  assert.deepEqual(sectionRows([block(centered)], { ...minimums, desktop: 18 }), { desktop: 18, tablet: 18, mobile: 18 });
  assert.deepEqual(sectionRows([block(centered)], { ...minimums, tablet: 16 }), { desktop: 12, tablet: 16, mobile: 16 });
  assert.deepEqual(sectionRows([block(centered)], { ...minimums, mobile: 14 }), { desktop: 12, tablet: 12, mobile: 14 });
  assert.deepEqual(sectionRows([block(centered)], { ...minimums, tablet: 5 }), { desktop: 12, tablet: 5, mobile: 5 });
});

for (const [name, source] of [['centered', centered], ['bottom', bottom]]) {
  test(`${name} image retains its position and image-to-section proportion across responsive widths`, () => {
    const blocks = [block(source)];
    const saved = JSON.stringify(blocks);
    const reference = resolveLayouts(blocks, geometry(1440, blocks)).image.desktop;
    for (const width of [320, 390, 480, 481, 600, 782]) {
      const mode = width <= 480 ? 'mobile' : 'tablet';
      const all = geometry(width, blocks);
      const p = resolveLayouts(blocks, all).image[mode];
      assert.equal(p._canvas.coreRows, reference._canvas.coreRows);
      assert.ok(occupiedRows(p) <= reference._canvas.coreRows);
      const scale = p._rect.width / reference._rect.width;
      close(p._canvas.height, reference._canvas.height * scale);
      close(p._rect.top, reference._rect.top * scale);
      close(p._rect.height, reference._rect.height * scale);
      close(all[mode].insetGap.y / all[mode].rowHeight, 24 / reference._canvas.rowHeight);
    }
    assert.equal(JSON.stringify(blocks), saved);
  });
}

test('explicit responsive heights and placements keep the same proportional row pitch', () => {
  const blocks = [block(centered)];
  const before = geometry(390, blocks).mobile;
  const taller = geometry(390, blocks, { ...minimums, mobile: 16 }).mobile;
  close(taller.rowHeight, before.rowHeight);
  assert.equal(taller.coreRows, 16);
  blocks[0].attributes.canvas.mobile = { ...centered, gridColumns: 8, column: 3, columnSpan: 4 };
  close(geometry(390, blocks).mobile.rowHeight, before.rowHeight);
});

test('centering does not narrow the same image span on the twelve-column mobile grid', () => {
  for (const width of [320, 390, 480]) {
    const centerBlocks = [block(centered)], bottomBlocks = [block(bottom)];
    const centerFrame = resolveLayouts(centerBlocks, geometry(width, centerBlocks)).image.mobile;
    const bottomFrame = resolveLayouts(bottomBlocks, geometry(width, bottomBlocks)).image.mobile;
    close(centerFrame._rect.width, bottomFrame._rect.width);
    close(centerFrame._canvas.height, bottomFrame._canvas.height);
  }
});

test('saving an inherited mobile image keeps its frame and grid scale on reopening', () => {
  const blocks = [block(centered)];
  const all = geometry(390, blocks);
  const layouts = resolveLayouts(blocks, all).image;
  blocks[0].attributes.canvas = savePlacement(blocks[0].attributes.canvas, layouts, 'mobile', layouts.mobile);
  const reopened = resolveLayouts(blocks, geometry(390, blocks)).image.mobile;
  for (const key of ['left', 'top', 'width', 'height']) close(reopened._rect[key], layouts.mobile._rect[key]);
  close(reopened._canvas.rowHeight, all.mobile.rowHeight);
  assert.equal(reopened._canvas.coreRows, 12);
});

test('moving a precise centered mobile image preserves its proportions and row scale', () => {
  for (const move of [p => nudgeCanvasPlacement(p, 'mobile', 1, 0),
    p => snapCanvasPlacement(dragMovePlacement(p, 'mobile', 30, 0), 'mobile', undefined, p)]) {
    const blocks = [block(centered)];
    const all = geometry(390, blocks), layout = resolveLayouts(blocks, all).image;
    const moved = move(layout.mobile);
    close(moved._rect.width, layout.mobile._rect.width);
    close(moved._rect.height, layout.mobile._rect.height);
    close(moved._rect.top, layout.mobile._rect.top);
    blocks[0].attributes.canvas = savePlacement(blocks[0].attributes.canvas, layout, 'mobile', moved);
    const reopened = resolveLayouts(blocks, geometry(390, blocks)).image.mobile;
    for (const key of ['left', 'top', 'width', 'height']) close(reopened._rect[key], moved._rect[key]);
    close(reopened._canvas.height, all.mobile.height);
  }
});
