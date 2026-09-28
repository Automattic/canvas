import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, dragMovePlacement, dragResizePlacement, mapCanvasPlacement, mapCanvasRowsPlacement, savedCanvasPlacement, settleCanvasPlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { resolveLayouts, savePlacement, rowHeightForWidth } from '../src/geometry.mjs';
import { preserveRowsOnResize } from '../src/row-resize.mjs';
import { serializePlacement } from '../src/serialization.mjs';

const minimum = { columnSpan: 1, rowSpan: 1 };
const close = (a, b, tolerance = .001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const geometry = (width = 1440, mode = 'desktop', count = 12, pad = 0) => {
  const padding = { top: pad, bottom: pad, left: 50, right: 50 };
  const inset = Math.max(50, (width - 1480) / 2);
  return { ...canvasColumns(width, padding, inset, width - inset, 24, mode, undefined,
    { ...padding, left: inset, right: inset }),
  ...canvasRows(pad, pad, count, 24, rowHeightForWidth(width - inset * 2, mode)),
  gap: 24, viewport: mode, referenceWidth: 1580, referenceColumns: 24 };
};
const image = desktop => ({ clientId: 'image', name: 'core/image', attributes: { canvas: { desktop } } });

for (const cells of [true, false]) for (const precise of [true, false]) for (const side of ['left', 'right']) {
  test(`${cells ? 'Grid' : 'Freeform'} ${precise ? 'precise' : 'cell'} blocks retain the ${side} edge after widening and reload`, () => {
    for (const [mode, width] of [['desktop', 1440], ['desktop', 1920], ['tablet', 800], ['mobile', 390]]) {
      const g = geometry(width, mode, 24);
      const start = mapCanvasPlacement({ column: 3, columnSpan: 4, row: 3, rowSpan: 4,
        ...(precise ? { free: { x: .25, y: 2, width: .234, ratio: 1.5 } } : {}) }, mode, g);
      const move = (from, dx, dy) => settleCanvasPlacement(
        dragMovePlacement(from, mode, dx, dy, minimum, 1, cells),
        mode, minimum, from, 6, undefined, cells, from, 'move');
      const drop = move(start, side === 'left' ? -width : width, 0);
      const edge = (rect, canvas) => side === 'left' ? rect.left : canvas.width - rect.left - rect.width;
      close(edge(drop._rect, g), 0);
      close(drop._rect.width, start._rect.width);
      close(drop._rect.height, start._rect.height);
      assert.equal(serializePlacement(drop).anchors[side === 'left' ? 'right' : 'left'], undefined);
      const saved = serializePlacement(drop);
      assert.equal(saved.anchors[side], 'canvas');
      for (const targetWidth of [width, width + 480, width + 960]) {
        const target = geometry(targetWidth, mode, 24);
        const reopened = mapCanvasPlacement(saved, mode, target);
        close(edge(reopened._rect, target), 0);
        const vertical = move(reopened, 0, target.rowHeight + target.gap);
        close(edge(vertical._rect, target), 0);
        close(vertical._rect.width, reopened._rect.width);
        close(vertical._rect.height, reopened._rect.height);
        assert.equal(serializePlacement(vertical).anchors[side], 'canvas');
      }
      const reopened = mapCanvasPlacement(saved, mode, g);
      const away = move(reopened, side === 'left' ? 160 : -160, 0);
      assert.notEqual(serializePlacement(away).anchors?.[side], 'canvas');
      assert.ok(edge(away._rect, g) > 0);
    }
  });
}

test('resizing slightly past the section bottom snaps to its existing edge without adding a row', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const pad of [0, 12, 37]) {
    const g = geometry(1440, mode, 12, pad);
    const start = mapCanvasRowsPlacement({ column: 5, columnSpan: 6, row: 1, rowSpan: 8, anchors: { right: 'canvas' } }, mode, g, minimum, { top:0 });
    for (const overshoot of [-5, 0, 5]) {
      const preview = dragResizePlacement(start, mode, 's', 0, g.height - start._rect.top - start._rect.height + overshoot, minimum);
      const drop = snapCanvasPlacement(preview, mode, minimum);
      close(drop._rect.top, 0);
      close(drop._rect.top + drop._rect.height, g.height);
      assert.equal(drop._canvas.coreRows, 12);
      assert.equal(drop._base.anchors.bottom, undefined);
      assert.equal(drop._base.anchors.top, undefined);
    }
  }
});

test('dragging slightly past the bottom captures the edge and preserves the moved span', () => {
  const g = geometry();
  const start = mapCanvasPlacement({ column: 3, columnSpan: 6, row: 3, rowSpan: 4 }, 'desktop', g);
  const preview = dragMovePlacement(start, 'desktop', g.width - start._rect.left - start._rect.width,
    g.height - start._rect.top - start._rect.height + 4, minimum);
  const drop = snapCanvasPlacement(preview, 'desktop', minimum, start);
  close(drop._rect.left + drop._rect.width, g.width);
  close(drop._rect.top + drop._rect.height, g.height);
  close(drop._rect.height, start._rect.height);
  assert.equal(drop._base.anchors.right, 'canvas');
  assert.equal(drop._base.anchors.bottom, undefined);
});

test('a precise centered image catches the original bottom before preview rows grow', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const pad of [0, 12, 37]) {
    const g = geometry(900, mode, 12, pad);
    const start = mapCanvasPlacement({ column: 8, columnSpan: 10, row: 4, rowSpan: 6,
      free: { x: .3, y: 3, width: .4, ratio: 1.4172,  } }, mode, g);
    for (const overshoot of [-20, -5, 0, 5, 20]) {
      const dy = g.height - start._rect.top - start._rect.height + overshoot;
      const preview = dragMovePlacement(start, mode, 0, dy, minimum);
      close(preview._rect.top + preview._rect.height, g.height);
      assert.equal(preview._canvas.coreRows, g.coreRows);
      const drop = snapCanvasPlacement(preview, mode, minimum, start);
      close(drop._rect.top + drop._rect.height, g.height);
      assert.ok(g.rows.some(row=>Math.abs(row.start-drop._rect.top)<.001));
      assert.ok(g.columns.some(col=>Math.abs(col.start-drop._rect.left)<.001));
      assert.equal(drop._canvas.coreRows, g.coreRows);
      assert.equal(savedCanvasPlacement(drop).free?.anchorY, undefined);
      const reopened = mapCanvasPlacement(savedCanvasPlacement(drop), mode, g);
      close(reopened._rect.top + reopened._rect.height, g.height);
    }
    const beyond = dragMovePlacement(start, mode, 0, g.height - start._rect.top - start._rect.height + 80, minimum);
    assert.ok(beyond._canvas.coreRows > g.coreRows, 'A deliberate drag beyond the edge can still grow the canvas');
  }
});

test('bottom-left image holds the boundary before deliberate row growth, including editor zoom', () => {
  for (const scale of [1, 2]) {
    const g = geometry();
    const start = mapCanvasPlacement({ column: 1, row: 5, columnSpan: 8, rowSpan: 8,
      gridColumns: 24, frameRatio: 1.00105, anchors: { left: 'canvas', right: 7 } }, 'desktop', g);
    const distance = g.height - start._rect.top - start._rect.height;
    const threshold = 24 * scale;
    const preview = dragMovePlacement(start, 'desktop', 0, distance + threshold - 1, minimum, scale);
    assert.equal(preview._canvas.coreRows, g.coreRows);
    close(preview._rect.top + preview._rect.height, g.height);
    const drop = snapCanvasPlacement(preview, 'desktop', minimum, start);
    assert.equal(savedCanvasPlacement(drop).anchors.left, 'canvas');
    assert.equal(savedCanvasPlacement(drop).anchors.bottom, undefined);
    const reopened = mapCanvasPlacement(savedCanvasPlacement(drop), 'desktop', g);
    close(reopened._rect.top + reopened._rect.height, g.height);
    const beyond = dragMovePlacement(start, 'desktop', 0, distance + threshold + 1, minimum, scale);
    assert.ok(beyond._canvas.coreRows > g.coreRows);
  }
});

test('Grid and Freeform require the same 24-pixel push before adding rows, including editor zoom', () => {
  for (const cells of [true, false]) for (const [mode, width] of [['desktop', 1440], ['tablet', 800], ['mobile', 390]]) for (const scale of [1, 2]) for (const pad of [0, 37]) {
    const g = geometry(width, mode, 12, pad);
    const start = mapCanvasPlacement({ column: 2, columnSpan: 3, row: 3, rowSpan: 4 }, mode, g);
    const distance = g.height - start._rect.top - start._rect.height;
    for (const overshoot of [0, 12, 24]) {
      const preview = dragMovePlacement(start, mode, 0, distance + overshoot * scale, minimum, scale, cells);
      const drop = cells ? snapCanvasPlacement(preview, mode, minimum, start) : preview;
      for (const value of [preview, drop, mapCanvasPlacement(savedCanvasPlacement(drop), mode, g)]) {
        assert.equal(value._canvas.coreRows, g.coreRows);
        close(value._rect.top + value._rect.height, g.height);
      }
    }
    const beyond = dragMovePlacement(start, mode, 0, distance + 25 * scale, minimum, scale, cells);
    assert.ok(beyond._canvas.coreRows > g.coreRows, 'Crossing 24 screen pixels adds rows in either mode');
  }
});

test('resizing holds the bottom through 24 screen pixels in Grid and Freeform before growing rows', () => {
  for (const cells of [true, false]) for (const [mode, width] of [['desktop', 1440], ['tablet', 800], ['mobile', 390]]) for (const scale of [1, 2]) for (const pad of [0, 37]) for (const kind of ['s', 'se', 'sw']) {
    const g = geometry(width, mode, 12, pad);
    const start = mapCanvasPlacement({ free: { x: .35, y: (g.height - 180 - pad) / (g.rowHeight + g.gap), width: 60 / width, ratio: .5 } }, mode, g);
    const distance = g.height - start._rect.top - start._rect.height;
    for (const overshoot of [0, 12, 24, 25]) {
      const preview = dragResizePlacement(start, mode, kind, kind.includes('w') ? -15 : 15, distance + overshoot * scale, minimum, undefined, false, scale);
      if (overshoot > 24) {
        assert.ok(preview._canvas.coreRows > g.coreRows);
        continue;
      }
      const drop = settleCanvasPlacement(preview, mode, minimum, undefined, 6 * scale, undefined, cells, start, kind);
      for (const value of [preview, drop, mapCanvasPlacement(serializePlacement(drop), mode, g)]) {
        assert.equal(value._canvas.coreRows, g.coreRows);
        close(value._rect.top + value._rect.height, g.height, .01);
        close(value._rect.top, start._rect.top, .01);
        if (kind.includes('w')) close(value._rect.left + value._rect.width, start._rect.left + start._rect.width, .01);
        else close(value._rect.left, start._rect.left, .01);
      }
    }
  }
});

test('the resize buffer preserves proportions and the fixed corner or center', () => {
  const mode = 'desktop', g = geometry(), ratio = .5;
  const start = mapCanvasPlacement({ free: { x: .35, y: (g.height - 180) / (g.rowHeight + g.gap), width: 60 / g.width, ratio } }, mode, g);
  const distance = g.height - start._rect.top - start._rect.height;
  for (const fromCenter of [false, true]) for (const kind of ['s', 'se', 'sw', 'e', 'w']) for (const scale of [1, 2]) for (const overshoot of [12, 24, 25]) {
    const widthDelta = (distance + overshoot * scale) * ratio * (fromCenter || !kind.includes('s') ? 2 : 1);
    const dx = widthDelta * (kind.includes('w') ? -1 : 1) / (fromCenter ? 2 : 1);
    const dy = widthDelta / ratio / (fromCenter ? 2 : 1);
    const preview = dragResizePlacement(start, mode, kind, dx, dy, minimum, ratio, fromCenter, scale);
    const rect = preview._rect, original = start._rect;
    close(rect.width / rect.height, ratio);
    const ax = fromCenter || !/[ew]/.test(kind) ? .5 : kind.includes('w') ? 1 : 0;
    const ay = fromCenter || !kind.includes('s') ? .5 : 0;
    close(rect.left + ax * rect.width, original.left + ax * original.width);
    close(rect.top + ay * rect.height, original.top + ay * original.height);
    if (overshoot <= 24) {
      assert.equal(preview._canvas.coreRows, g.coreRows);
      close(rect.top + rect.height, g.height);
    } else assert.ok(preview._canvas.coreRows > g.coreRows);
  }
});

test('ordinary section resizing retains placement while Shift resizing adds space around content', () => {
  const g = geometry();
  const source = { column: 13, columnSpan: 12, row: 1, rowSpan: 12, gridColumns: 24,
    anchors: { left: 'center', right: 'canvas' }, frameRatio: 1.32231 };
  const layouts = resolveLayouts([image(source)], { desktop: g });
  assert.deepEqual(preserveRowsOnResize(layouts, 'desktop', 0, 18), {});
  const grown = resolveLayouts([image(source)], { desktop: geometry(1440, 'desktop', 18) }).image.desktop;
  close(grown._rect.height, layouts.image.desktop._rect.height);
  const shifted = preserveRowsOnResize(layouts, 'desktop', 2, 16).image;
  close(shifted._rect.height, layouts.image.desktop._rect.height);
  close(shifted._rect.top, 2 * (g.rowHeight + g.gap));
});


test('moving the supplied eight-column image to either side keeps its frame instead of stretching to a numeric edge', () => {
  const source = { column: 9, row: 4, columnSpan: 8, rowSpan: 12, gridColumns: 24, frameRatio: .965505 };
  for (const width of [1440, 1920]) for (const side of ['left', 'right']) {
    const g = geometry(width, 'desktop', 18);
    const start = resolveLayouts([image(source)], { desktop: g }).image.desktop;
    const preview = dragMovePlacement(start, 'desktop', side === 'left' ? -width : width, 0, minimum);
    const drop = settleCanvasPlacement(preview, 'desktop', minimum, start);
    close(drop._rect.width, start._rect.width);
    close(drop._rect.height, start._rect.height);
    const saved = serializePlacement(drop);
    assert.deepEqual(saved.anchors, { [side]: 'canvas' });
    const reopened = resolveLayouts([image(saved)], { desktop: g }).image.desktop;
    close(reopened._rect.width, start._rect.width, .01);
    close(reopened._rect.height, start._rect.height, .01);
    close(side === 'left' ? reopened._rect.left : g.width - reopened._rect.left - reopened._rect.width, 0, .01);
  }
});

test('keyboard-sized Freeform moves and resizes can cross the bottom without a pointer buffer', () => {
  const g=geometry();
  const start=mapCanvasPlacement({free:{x:.2,y:(g.height-100-g.padding.top)/(g.rowHeight+g.gap),width:100/g.width,ratio:1}},'desktop',g);
  for(const amount of [1,10]) {
    const moved=dragMovePlacement(start,'desktop',0,amount,minimum,1,false,false);
    close(moved._rect.top,start._rect.top+amount);
    const resized=dragResizePlacement(start,'desktop','s',0,amount,minimum,undefined,false,1,false);
    close(resized._rect.height,start._rect.height+amount);
  }
});
