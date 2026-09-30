import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { COLUMNS, rowHeightForWidth } from '../src/placement.mjs';
import { canvasColumns, canvasRows, dragMovePlacement, snapCanvasPlacement } from '../src/canvas-geometry.mjs';
import { freeFrameFromRect } from '../src/aspect-ratio.mjs';
import { resolveLayouts, savePlacement } from '../src/geometry.mjs';
import { responsiveRowMetrics, sectionGridPadding } from '../src/section-layout.mjs';
import { scaleCanvasContent } from '../src/content-scale.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
// The reported Pattern 6 has desktop placements only. In particular, its
// opposing wide snaps must not pull the headline and rear image together.
const pattern = () => [
  ['image', { column: 14, row: 3, columnSpan: 11, rowSpan: 18, gridColumns: 24, frameRatio: .702711, anchors: { right: 'wide' } }],
  ['image', { column: 12, row: 8, columnSpan: 11, rowSpan: 8, gridColumns: 24, frameRatio: 1.62852 }],
  ['heading', { column: 1, row: 5, columnSpan: 10, rowSpan: 5, gridColumns: 24, anchors: { left: 'wide' } }],
  ['paragraph', { column: 1, row: 14, columnSpan: 9, rowSpan: 2, gridColumns: 24, anchors: { left: 'wide' } }],
  ['buttons', { column: 1, row: 16, columnSpan: 6, rowSpan: 2, gridColumns: 24, anchors: { left: 'wide' } }],
].map(([name, desktop], i) => ({ clientId: String(i), name: `core/${name}`, attributes: { canvas: { desktop, ...(name === 'heading' ? { fill: true } : {}) } } }));

function geometry(width) {
  const padding = { top: 0, bottom: 0, left: 50, right: 50 };
  const inset = Math.max(padding.left, (width - 1340) / 2);
  const all = Object.fromEntries(Object.entries(COLUMNS).map(([mode, count]) => {
    const gridPadding = sectionGridPadding(padding, width, inset, width - inset);
    return [mode, {
      ...canvasColumns(width, padding, inset, width - inset, 10, mode, count, gridPadding),
      ...canvasRows(0, 0, 22, 10, rowHeightForWidth(width - gridPadding.left - gridPadding.right, mode)),
      gap: 10, viewport: mode, align: 'full', referenceWidth: 1440, referenceColumns: 24,
    }];
  }));
  for (const mode of Object.keys(all)) all[mode] = responsiveRowMetrics([], mode, all);
  return all;
}

for (const precise of [false, true]) {
  test(`Pattern 6 scales every frame and its image overlap together inside wide boundaries, precise=${precise}`, () => {
    const blocks = pattern(), base = geometry(1440);
    const reference = resolveLayouts(blocks, base);
    if (precise) for (const block of blocks.slice(0, 3)) {
      block.attributes.canvas.desktop.free = freeFrameFromRect(reference[block.clientId].desktop._rect, base.desktop);
    }
    const saved = JSON.stringify(blocks);
    for (const width of [320, 390, 600, 782, 783, 1000, 1440, 1920, 2560, 3840, 1440]) {
      const mode = width <= 480 ? 'mobile' : width <= 782 ? 'tablet' : 'desktop';
      const all = geometry(width), layouts = resolveLayouts(blocks, all), scale = Math.min(1, (width - 100) / 1340);
      for (const block of blocks) {
        const actual = layouts[block.clientId][mode]._rect, expected = reference[block.clientId].desktop._rect;
        close(actual.left - all[mode].wideStart, (expected.left - 50) * scale);
        for (const key of ['width', 'height', 'top']) close(actual[key], expected[key] * scale);
      }
      const [back, front, heading] = blocks.map(b => layouts[b.clientId][mode]._rect);
      assert.ok(heading.left + heading.width < Math.min(back.left, front.left), 'the headline must stay clear of both images');
      assert.ok(front.left + front.width > back.left, 'keep the intentional image overlap');
      close(all[mode].height, base.desktop.height * scale);
    }
    assert.equal(JSON.stringify(blocks), saved, 'rendering must not rewrite authored placements');
  });
}

test('a full-width wide-guide move stays attached to the guide after save and viewport changes', () => {
  const width = 1920;
  const blocks = pattern(), all = geometry(width), g = all.desktop;
  const layout = resolveLayouts(blocks, all)['1'];
  const preview = dragMovePlacement(layout.desktop, 'desktop', g.wideStart - layout.desktop._rect.left, 0);
  const moved = snapCanvasPlacement(preview, 'desktop', { columnSpan: 1, rowSpan: 1 }, layout.desktop);
  close(moved._rect.left, g.wideStart);
  close(moved._rect.width, layout.desktop._rect.width);
  blocks[1].attributes.canvas = savePlacement(blocks[1].attributes.canvas, layout, 'desktop', moved);
  for (const width of [1440, 2560, 3840, 2560]) {
    const next = geometry(width), p = resolveLayouts(blocks, next)['1'].desktop._rect;
    const scale = next.desktop.contentScale / g.contentScale;
    close(p.left, next.desktop.wideStart);
    for (const key of ['width', 'height', 'top']) close(p[key], moved._rect[key] * scale);
  }
});

test('natural text follows the composition scale without compounding or replacing authored typography', t => {
  const dom = new JSDOM(`<div class="canvas__item"><p style="font-size:22px;line-height:33px">Paragraph</p></div>
    <div class="canvas__item"><div class="wp-block-button"><a class="wp-block-button__link" style="font-size:18px;line-height:27px">Button</a></div></div>
    <h2 class="canvas__item" data-canvas-text-fit="true" style="font-size:50px">Fill area</h2>
    <p class="canvas__item has-fit-text" style="font-size:60px">Fit text</p>`);
  t.after(() => dom.window.close());
  const items = [...dom.window.document.querySelectorAll('.canvas__item')];
  const paragraph = items[0].firstElementChild, button = items[1].querySelector('a');
  const set = (node, key, value) => node.style.setProperty(key, value);
  const g = { align: 'full', viewport: 'desktop', contentScale: 2 };
  for (let i = 0; i < 3; i++) {
    scaleCanvasContent(items, g, set);
    assert.equal(paragraph.style.getPropertyValue('--canvas-content-font-size'), '44px');
    assert.equal(button.style.getPropertyValue('--canvas-content-font-size'), '36px');
    assert.equal(paragraph.style.fontSize, '22px');
    assert.equal(button.style.fontSize, '18px');
    assert.equal(paragraph.style.getPropertyValue('--canvas-content-line-height'), '1.5');
    for (const fitted of items.slice(2)) assert.equal(fitted.hasAttribute('data-canvas-content-scaled'), false);
  }
  paragraph.style.fontSize = '24px';
  scaleCanvasContent(items, g, set);
  assert.equal(paragraph.style.getPropertyValue('--canvas-content-font-size'), '48px');
  for (const override of [{ contentScale: .5 }, { viewport: 'mobile' }, { align: 'wide' }]) {
    scaleCanvasContent(items, { ...g, ...override }, set);
    for (const text of [paragraph, button]) assert.equal(text.hasAttribute('data-canvas-content-scaled'), false);
    assert.equal(paragraph.style.fontSize, '24px');
  }
  scaleCanvasContent(items, g, set);
  scaleCanvasContent(items, g, set, [{ _base: { anchors: { left: 'wide', right: 'wide' } } }]);
  assert.equal(paragraph.hasAttribute('data-canvas-content-scaled'), false, 'explicit wide constraints do not enlarge contained text');
  assert.equal(button.hasAttribute('data-canvas-content-scaled'), true, 'neighboring full-width content still scales');
  scaleCanvasContent(items, g, set);
  items[0].setAttribute('data-canvas-text-fit', 'true');
  scaleCanvasContent(items, g, set);
  assert.equal(paragraph.hasAttribute('data-canvas-content-scaled'), false);
});
