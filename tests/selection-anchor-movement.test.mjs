import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasColumns, canvasRows, mapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { moveSelection } from '../src/selection-movement.mjs';
import { savePlacement } from '../src/geometry.mjs';

const geometry = width => {
  const inset = Math.max(40, (width - 1200) / 2);
  const padding = { left: inset, right: inset, top: 0, bottom: 0 };
  return { ...canvasColumns(width, padding, inset, width - inset, 10, 'desktop', 24),
    ...canvasRows(0, 0, 24, 10), gap: 10, viewport: 'desktop', referenceWidth: 1280 };
};
for (const side of ['left', 'right']) for (const snap of [true, false]) {
  test(`selection movement releases ${side} edge after horizontal movement (${snap ? 'Grid' : 'Freeform'})`, () => {
    const g = geometry(2000);
    const source = { column: 3, columnSpan: 6, row: 4, rowSpan: 5, gridColumns: 24,
      free: { x: .2, y: 3, width: .2, ratio: 1.2 }, anchors: { [side]: 'canvas' } };
    const start = mapCanvasPlacement(source, 'desktop', g);
    const layouts = { image: { desktop: start, image: true } };
    const dx = side === 'left' ? 480 : -480;
    const moved = moveSelection(layouts, ['image'], 'desktop', 'image', dx, 0, { snap }).image;
    const saved = savePlacement({ desktop: source }, layouts.image, 'desktop', moved);
    assert.equal(saved.desktop.anchors?.[side], undefined);
    const reopened = mapCanvasPlacement(saved.desktop, 'desktop', g);
    for (const key of ['left', 'top', 'width', 'height']) {
      assert.ok(Math.abs(reopened._rect[key] - moved._rect[key]) < .01, key);
    }
    const narrow = mapCanvasPlacement(saved.desktop, 'desktop', geometry(900));
    assert.ok(narrow._rect.left > 0);
    assert.ok(narrow._rect.left + narrow._rect.width < 900);
    const vertical = moveSelection(layouts, ['image'], 'desktop', 'image', 0, 30, { snap }).image;
    const verticalSaved = savePlacement({ desktop: source }, layouts.image, 'desktop', vertical);
    assert.equal(verticalSaved.desktop.anchors?.[side], 'canvas');
  });
}

test('moving the supplied outer numeric placement inward saves the new position', () => {
  const g = geometry(2600);
  const source = { column: 1, row: 4, columnSpan: 13, rowSpan: 17, gridColumns: 24,
    frameRatio: 1.19658, anchors: { left: -8, right: 6 } };
  const start = mapCanvasPlacement(source, 'desktop', g);
  const layouts = { image: { desktop: start, image: true } };
  const moved = moveSelection(layouts, ['image'], 'desktop', 'image', 600, 0).image;
  const saved = savePlacement({ desktop: source }, layouts.image, 'desktop', moved);
  assert.equal(saved.desktop.anchors, undefined);
  const restored = mapCanvasPlacement(saved.desktop, 'desktop', g);
  assert.ok(Math.abs(restored._rect.left - moved._rect.left) < .01);
  const narrow = mapCanvasPlacement(saved.desktop, 'desktop', geometry(900));
  assert.ok(narrow._rect.left > 0);
  assert.ok(narrow._rect.left + narrow._rect.width < 900);
});

test('moving a proportionally resized selection preserves dimensions and spacing after saving', async () => {
  const { resizeSelection } = await import('../src/selection-resize.mjs');
  for (const mode of ['desktop', 'tablet', 'mobile']) for (const snap of [true, false]) {
    const g = geometry(1200);
    const starts = [0,1,2].map(i => mapCanvasPlacement({free:{x:.1+i*.23,y:2+i,width:.12+i*.025,ratio:1.2+i*.2}},mode,g));
    const ids = ['a','b','c'];
    const initial = Object.fromEntries(ids.map((id,i)=>[id,{[mode]:starts[i]}]));
    const resized = resizeSelection(initial,ids,mode,'se',65,25,{snap});
    const layouts = Object.fromEntries(ids.map(id=>[id,{desktop:resized[id],[mode]:resized[id]}]));
    const moved = moveSelection(layouts,ids,mode,'a',55,15,{snap});
    const delta = {left:moved.a._rect.left-resized.a._rect.left,top:moved.a._rect.top-resized.a._rect.top};
    for(const id of ids) {
      const saved=savePlacement({},layouts[id],mode,moved[id]);
      const restored=mapCanvasPlacement(saved[mode],mode,g);
      for(const key of ['width','height']) assert.ok(Math.abs(restored._rect[key]-resized[id]._rect[key])<.01,key);
      for(const key of ['left','top']) assert.ok(Math.abs(restored._rect[key]-resized[id]._rect[key]-delta[key])<.01,key);
    }
  }
});
