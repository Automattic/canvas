import test from 'node:test';
import assert from 'node:assert/strict';
import { fittingFontSize } from '../src/text-fit.mjs';
import { resolveLayouts, changeViewport } from '../src/geometry.mjs';

test('fits both width and height, including discontinuous line wraps', () => {
  const measure = (size) => ({ width: Math.min(size * 20, 300), height: Math.ceil(size * 20 / 300) * size * 1.2 });
  const size = fittingFontSize(measure, 300, 120);
  assert.ok(measure(size).height <= 120);
  assert.ok(measure(size + 0.2).height > 120);
  assert.ok(fittingFontSize(measure, 300, 240) > size);
  assert.ok(fittingFontSize(measure, 150, 120) < size);
});

test('keeps the readability floor when the area is too small', () => {
  assert.equal(fittingFontSize((size) => ({ width: 100, height: size * 100 }), 100, 24, 12), 12);
});

test('text fitting is opt-in and survives changes to either viewport', () => {
  const blocks = [{ clientId: 'a', name: 'core/heading', attributes: { canvas: { fill: true } } }, { clientId: 'b', name: 'core/paragraph', attributes: {} }];
  const layouts = resolveLayouts(blocks);
  assert.equal(layouts.a.fill, true);
  assert.equal(layouts.b.fill, false);
  const changed = changeViewport(layouts.a, 'mobile', { ...layouts.a.mobile, columnSpan: 4 });
  assert.equal(changed.fill, true);
  assert.deepEqual(changed.desktop, layouts.a.desktop);
});

test('does not accept fractional text overflow at the width boundary', () => {
  const width = 329.984;
  const size = fittingFontSize((size) => ({ width: size * 4.12, height: size * 1.05 }), width, 112);
  assert.ok(size * 4.12 <= width);
  assert.ok(size > 79);
});

test('fitting tracks grouped descendants and releases removed, disabled, and disposed items', async () => {
  const { JSDOM } = await import('jsdom');
  const { observeTextFit } = await import('../src/text-fit.mjs');
  const dom = new JSDOM('<div class="canvas__grid"><div class="group"><div class="group"><p data-canvas-text-fit="true">Nested text</p></div></div><div class="canvas__grid"><p data-canvas-text-fit="true">Other canvas</p></div></div>');
  const view = dom.window;
  const grid = view.document.querySelector('.canvas__grid');
  const item = grid.querySelector('p');
  const other = grid.querySelector('.canvas__grid').querySelector('p');
  const frames = new Map();
  let nextFrame = 0;
  view.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  view.cancelAnimationFrame = id => frames.delete(id);
  const observed = new Set();
  view.ResizeObserver = class {
    observe(node) { observed.add(node); }
    unobserve(node) { observed.delete(node); }
    disconnect() { observed.clear(); }
  };
  // jsdom has no layout; discovery and lifecycle are the behavior under test.
  const flush = async () => {
    await Promise.resolve();
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback());
  };
  const dispose = observeTextFit(grid);
  assert.ok(observed.has(item));
  assert.ok(!observed.has(other));
  grid.append(item); // Ungroup without replacing the DOM node.
  await flush();
  assert.ok(observed.has(item));
  item.setAttribute('data-canvas-text-fitted', '');
  item.style.setProperty('--canvas-text-size', '32px');
  item.removeAttribute('data-canvas-text-fit');
  await flush();
  assert.ok(!observed.has(item));
  assert.equal(item.style.getPropertyValue('--canvas-text-size'), '');
  assert.ok(!item.hasAttribute('data-canvas-text-fitted'));
  item.setAttribute('data-canvas-text-fit', 'true');
  await flush();
  assert.ok(observed.has(item));
  item.remove();
  await flush();
  assert.ok(!observed.has(item));
  grid.append(item);
  await flush();
  assert.ok(observed.has(item));
  dispose();
  assert.equal(observed.size, 0);
  view.dispatchEvent(new view.Event('resize'));
  await flush();
  assert.equal(frames.size, 0);
  dom.window.close();
});
