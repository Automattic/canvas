import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, dragCanvasPlacement, mapCanvasPlacement, nudgeCanvasPlacement, occupiedRows, resizeCanvasWithKey, savedCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { columnsForAlignment, projectPlacement, normalizePlacement, resolveLayouts, savePlacement, minimumSpans } from '../src/geometry.mjs';
import { droppedLayouts, placementRectangle } from '../src/drop-layout.mjs';

const padding = { top: 37, right: 53, bottom: 61, left: 29 };
const geometry = (pad = padding, width = 1200, mode = 'desktop', count = 12) => ({
  ...canvasColumns(width, pad, Math.min(100, width / 10), width - Math.min(100, width / 10), 12, mode),
  ...canvasRows(pad.top, pad.bottom, count, 12), gap: 12,
});
const base = normalizePlacement({ column: 1, columnSpan: 12, row: 1, rowSpan: 3 });
const minimum = minimumSpans('core/paragraph');
const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);

test('ordinary placements respect all four padding sides at every width and viewport', () => {
  for (const align of [undefined, 'wide', 'full']) for (const [mode, width] of [['desktop', 1200], ['tablet', 800], ['mobile', 390]]) {
    for (const pad of [padding, { top: 0, right: 0, bottom: 0, left: 0 }]) {
      const count = columnsForAlignment(mode, align);
      const g = { ...geometry(pad, width, mode), ...canvasColumns(width, pad, 0, width, 12, mode, count) };
      const item = mapCanvasPlacement({ gridColumns: count, column: 1, columnSpan: count, row: 1, rowSpan: 12 }, mode, g);
      close(item._rect.left, pad.left);
      close(item._rect.top, pad.top);
      close(item._rect.left + item._rect.width, width - pad.right);
      close(item._rect.top + item._rect.height, g.height - pad.bottom);
      assert.deepEqual(mapCanvasPlacement(savedCanvasPlacement(item), mode, g)._rect, item._rect);
    }
  }
});

test('snapping and resizing to the first and last logical cells keep native padding', () => {
  const g = geometry();
  const full = mapCanvasPlacement({ ...base, column: 1, columnSpan: 24 }, 'desktop', g);
  const snapped = snapCanvasPlacement(full, 'desktop', minimum);
  assert.deepEqual(snapped._rect, full._rect);
  assert.notEqual(snapped._base.anchors?.left, 'canvas');
  assert.notEqual(snapped._base.anchors?.right, 'canvas');
  assert.deepEqual(snapCanvasPlacement(snapped, 'desktop', minimum)._rect, full._rect);
  const inner = mapCanvasPlacement({ ...base, column: 3, columnSpan: 18 }, 'desktop', g);
  const left = dragCanvasPlacement(inner, 'desktop', 'w', padding.left - inner._rect.left, 0, minimum);
  const right = dragCanvasPlacement(left, 'desktop', 'e', g.width - padding.right - left._rect.left - left._rect.width, 0, minimum);
  assert.deepEqual(right._rect, full._rect);
});

test('keyboard resizing can explicitly extend through padding to the canvas edge and back', () => {
  const g = geometry();
  const start = mapCanvasPlacement({ ...base, column: 1, columnSpan: 24 }, 'desktop', g);
  const outer = resizeCanvasWithKey(start, 'desktop', 1, 0, minimum);
  close(outer._rect.left + outer._rect.width, g.columns.at(-1).end);
  assert.ok(outer._rect.width > start._rect.width);
  const expanded = resizeCanvasWithKey(outer, 'desktop', 1, 0, minimum);
  close(expanded._rect.left, padding.left);
  close(expanded._rect.left + expanded._rect.width, g.width);
  assert.equal(expanded._base.anchors?.right, 'canvas');
  const restored = resizeCanvasWithKey(resizeCanvasWithKey(expanded, 'desktop', -1, 0, minimum), 'desktop', -1, 0, minimum);
  assert.deepEqual(restored._rect, start._rect);
});

test('changing padding remaps the same saved cells without changing placement data', () => {
  const saved = { ...base, column: 3, columnSpan: 16 };
  const original = JSON.stringify(saved);
  const initial = mapCanvasPlacement(saved, 'desktop', geometry());
  const pad = { top: 80, right: 120, bottom: 40, left: 60 };
  const changed = mapCanvasPlacement(saved, 'desktop', geometry(pad));
  assert.ok(changed._rect.left >= pad.left);
  assert.ok(changed._rect.left + changed._rect.width <= changed._canvas.width - pad.right);
  assert.notDeepEqual(changed._rect, initial._rect);
  assert.equal(JSON.stringify(saved), original);
  assert.deepEqual(mapCanvasPlacement(saved, 'desktop', geometry())._rect, initial._rect);
});

test('new image drops use compact near-square cells across viewport widths', () => {
  for (const [mode, width] of [['desktop', 1200], ['desktop', 1800], ['tablet', 800], ['mobile', 390]]) {
    const g = geometry(padding, width, mode);
    const metrics = { ...g, mode, geometry: { [mode]: g } };
    const image = { clientId: 'image', name: 'core/image', attributes: {} };
    const layout = droppedLayouts([], [image], mode, { x: width / 3, y: 100 }, metrics).image;
    const rectangle = placementRectangle(layout[mode], metrics);
    assert.ok(rectangle.width < width * 0.8);
    assert.ok(Math.abs(rectangle.height - rectangle.width) <= (24 + g.gap) / 2,
      `${mode} ${width}: ${rectangle.width} x ${rectangle.height}`);
  }
});

test('content rows keep a fixed pitch across padding, spacing, row counts and viewports', () => {
  for (const [top, bottom] of [[0, 0], [37, 61], [3, 5], [120, 80]]) {
    for (const gap of [0, 12, 27.5]) {
      for (const count of [1, 12, 30]) {
        const g = canvasRows(top, bottom, count, gap);
        const core = g.rows.slice(g.before, g.before + count);
        for (const [i, row] of core.entries()) {
          close(row.end - row.start, 24);
          close(row.start, top + i * (24 + gap));
        }
        // The rendered CSS and the gesture/outline geometry use the same
        // fixed tracks, including fractional and clipped padding tracks.
        const cssTracks = g.rowTemplate.split(' ');
        assert.ok(cssTracks.every((track) => /^\d+(\.\d+)?px$/.test(track)));
        close(cssTracks.reduce((sum, track) => sum + parseFloat(track), 0), g.height);
        for (const mode of ['desktop', 'tablet', 'mobile']) {
          const canvas = { ...canvasColumns(600, { top, bottom, left: 20, right: 20 }, 20, 580, gap, mode), ...g, gap };
          const item = mapCanvasPlacement(normalizePlacement({ row: 1, rowSpan: count }, mode), mode, canvas);
          close(item._rect.height, count * 24 + (count - 1) * gap);
        }
      }
    }
  }
});

test('logical cells and canvas heights use current grid coordinates', () => {
  for (const pad of [padding, { top: 0, right: 0, bottom: 0, left: 0 }, { top: 3, right: 360, bottom: 5, left: 450 }]) {
    const g = geometry(pad);
    for (const value of [base, normalizePlacement({ column: 3, columnSpan: 20, row: 4, rowSpan: 2 })]) {
      const next = mapCanvasPlacement(value, 'desktop', g);
      close(next._rect.left, g.contentColumns[value.column - 1].start);
      close(next._rect.width, g.contentColumns[value.column + value.columnSpan - 2].end - g.contentColumns[value.column - 1].start);
      close(next._rect.top, pad.top + (value.row - 1) * 36);
      assert.equal(savedCanvasPlacement(next).gridColumns, 24);
      assert.equal(value.gridColumns, 24);
      assert.deepEqual(mapCanvasPlacement(savedCanvasPlacement(next), 'desktop', g)._rect, next._rect);
    }
    close(g.height, 12 * 24 + 11 * 12 + pad.top + pad.bottom);
  }
});

test('resizing reaches all four canvas edges and exact padding guidelines', () => {
  const g = geometry();
  let p = mapCanvasPlacement(base, 'desktop', g);
  p = dragCanvasPlacement(p, 'desktop', 'nw', -p._rect.left, -p._rect.top, minimum);
  p = dragCanvasPlacement(p, 'desktop', 'se', g.width - p._rect.left - p._rect.width, g.height - p._rect.top - p._rect.height, minimum);
  assert.deepEqual(p._rect, { left: 0, top: 0, width: g.width, height: g.height });
  assert.equal(p._base.anchors?.left, 'canvas');
  assert.equal(p._base.anchors?.bottom, undefined);
  p = dragCanvasPlacement(p, 'desktop', 'nw', padding.left + 4, padding.top + 4, minimum);
  p = dragCanvasPlacement(p, 'desktop', 'se', -padding.right - 4, -padding.bottom - 4, minimum);
  close(p._rect.left, padding.left);
  close(p._rect.top, padding.top);
  close(p._rect.width, g.width - padding.left - padding.right);
  close(p._rect.height, g.height - padding.top - padding.bottom);
  assert.equal(p._base.anchors?.right, 'padding');
});

test('semantic anchors follow padding or canvas edges across widths and mobile inheritance', () => {
  for (const target of ['padding', 'canvas']) {
    const saved = { ...base, anchors: { ...(base).anchors, left: target, right: target } };
    for (const mode of ['desktop', 'mobile']) {
      const p = projectPlacement(saved, 'desktop', mode);
      const g = geometry({ ...padding, left: 45, top: 80 }, mode === 'mobile' ? 390 : 1500, mode);
      const resolved = mapCanvasPlacement(p, mode, g);
      close(resolved._rect.left, target === 'padding' ? 45 : 0);
      close(resolved._rect.top, 80 + (base.row - 1) * (g.rowHeight + g.gap));
      close(resolved._rect.left + resolved._rect.width, g.width - (target === 'padding' ? padding.right : 0));
      assert.equal(resolved.rowSpan, base.rowSpan);
    }
  }
});

test('vertical edits retain horizontal boundaries and save no measured geometry', () => {
  const g = geometry();
  const resolved = resolveLayouts([{ clientId: 'a', attributes: { canvas: { desktop: base } } }], { desktop: g }).a;
  const next = dragCanvasPlacement(resolved.desktop, 'desktop', 'n', 0, -padding.top, minimum);
  const saved = savePlacement({ desktop: base }, resolved, 'desktop', next);
  assert.equal(saved.tablet, undefined);
  assert.equal(saved.mobile, undefined);
  assert.equal(saved.desktop.anchors?.left, undefined);
  assert.ok(!JSON.stringify(saved).includes('_'));
  const reopened = mapCanvasPlacement(JSON.parse(JSON.stringify(saved.desktop)), 'desktop', g);
  for (const key of Object.keys(next._rect)) assert.ok(Math.abs(reopened._rect[key] - next._rect[key]) < .001);
});

test('bottom-edge anchors never recursively add content rows', () => {
  let g = geometry();
  const initial = mapCanvasPlacement(base, 'desktop', g);
  const p = dragCanvasPlacement(initial, 'desktop', 's', 0, g.height - initial._rect.top - initial._rect.height, minimum);
  for (let i = 0; i < 20; i++) {
    const count = Math.max(12, occupiedRows(p));
    g = geometry(padding, 1200, 'desktop', count);
    assert.equal(count, 12);
    close(mapCanvasPlacement(savedCanvasPlacement(p), 'desktop', g)._rect.top + mapCanvasPlacement(savedCanvasPlacement(p), 'desktop', g)._rect.height, g.height);
  }
});

test('keyboard movement releases the moved axis while keeping other edge anchors', () => {
  const g = geometry();
  const p = mapCanvasPlacement({ ...base, anchors: { ...(base).anchors, left: 'padding' } }, 'desktop', g);
  const next = nudgeCanvasPlacement(p, 'desktop', 1, 0);
  assert.notEqual(next._base.anchors?.left, 'padding');
  close(next._rect.top,p._rect.top);
  assert.ok(next._rect.left > p._rect.left);
});

test('dragging below the canvas grows content rows, with stable reopening', () => {
  const g = geometry();
  const start = mapCanvasPlacement(base, 'desktop', g);
  const next = dragCanvasPlacement(start, 'desktop', 's', 0, g.height + 100 - start._rect.top - start._rect.height, minimum);
  assert.ok(occupiedRows(next) > 12);
  const saved = savedCanvasPlacement(next);
  const grown = geometry(padding, 1200, 'desktop', occupiedRows(next));
  const reopened = mapCanvasPlacement(saved, 'desktop', grown);
  close(reopened._rect.height, next._rect.height);
  assert.equal(occupiedRows(reopened), occupiedRows(next));
});

test('Buttons cannot collapse below their minimum span when resized into a corner', () => {
  const g = geometry();
  const minimum = minimumSpans('core/buttons');
  const start = mapCanvasPlacement(normalizePlacement({ column: 5, columnSpan: 8, row: 4, rowSpan: 4 }), 'desktop', g, minimum);
  for (const kind of ['nw', 'ne', 'sw', 'se']) {
    const next = dragCanvasPlacement(start, 'desktop', kind, kind.includes('w') ? 10000 : -10000, kind.includes('n') ? 10000 : -10000, minimum);
    assert.ok(next.columnSpan >= 4);
    assert.ok(next.rowSpan >= 2);
    if (kind.includes('w')) close(next._rect.left + next._rect.width, start._rect.left + start._rect.width);
    else close(next._rect.left, start._rect.left);
    if (kind.includes('n')) close(next._rect.top + next._rect.height, start._rect.top + start._rect.height);
    else close(next._rect.top, start._rect.top);
  }
});

test('drops and their preview use the same padding and canvas anchors as gestures', () => {
  const g = geometry();
  const metrics = { ...g, mode: 'desktop', scale: 1, geometry: { desktop: g } };
  for (const [point, left, top] of [[{ x: 2, y: 2 }, 0, 0], [{ x: padding.left + 3, y: padding.top + 3 }, padding.left, padding.top]]) {
    const incoming = [{ clientId: 'new', name: 'core/paragraph', attributes: {} }];
    const saved = droppedLayouts([], incoming, 'desktop', point, metrics).new;
    const preview = placementRectangle(saved.desktop, metrics);
    const result = resolveLayouts([{ ...incoming[0], attributes: { canvas: saved } }], metrics.geometry).new.desktop;
    close(preview.left, left);
    close(preview.top, top);
    assert.deepEqual(preview, result._rect);
  }
});
