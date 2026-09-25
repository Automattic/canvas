import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { measureText } from '../src/text-fit.mjs';

function fixture(t) {
  const dom = new JSDOM('<p style="font-size:20px;line-height:24px;font-family:sans-serif">Sample text</p>');
  t.after(() => dom.window.close());
  const { document, Range } = dom.window;
  const item = document.querySelector('p');
  let probes = 0;
  const append = document.body.append.bind(document.body);
  document.body.append = (...nodes) => {
    probes += nodes.filter(node => node.classList?.contains('canvas-measure-text')).length;
    append(...nodes);
  };
  // Only cache behavior is mocked; browser checks verify real line wrapping.
  Range.prototype.getBoundingClientRect = function () {
    const probe = document.querySelector('.canvas-measure-text');
    return { width: probe.textContent.length * parseFloat(probe.style.fontSize) / 2 };
  };
  const cache = new WeakMap();
  const read = (width = 200, size = 20, includeBox = false, measurements = cache) =>
    measureText(item, width, measure => measure(size), includeBox, measurements);
  return { item, cache, read, probes: () => probes, document };
}

test('plain text measurements survive position-only changes without creating more DOM probes', t => {
  const { item, read, probes, document } = fixture(t);
  const initial = read();
  item.style.setProperty('--canvas-desktop-column', '4');
  item.style.setProperty('--canvas-free-top', '20px');
  assert.deepEqual(read(), initial);
  assert.equal(probes(), 1);
  assert.equal(document.querySelector('.canvas-measure-text'), null);
  initial.width = -1;
  assert.ok(read().width > 0, 'callers cannot mutate the cached result');
});

test('width, font size, text, typography, language, and box insets invalidate measurements', t => {
  const { item, read, probes } = fixture(t);
  read();
  read(100); assert.equal(probes(), 2);
  read(200); assert.equal(probes(), 2, 'previous width remains reusable');
  read(200, 24); assert.equal(probes(), 3);
  item.textContent += ' updated'; read(); assert.equal(probes(), 4);
  item.style.fontWeight = 'bold'; read(); assert.equal(probes(), 5);
  item.lang = 'fr'; read(); assert.equal(probes(), 6);
  item.style.lineHeight = '30px'; read(); assert.equal(probes(), 7);
  item.style.paddingLeft = '10px';
  const measured = read(200, 20, true);
  assert.equal(probes(), 8);
  assert.equal(measured.width, item.textContent.length * 10 + 10);
  read(200, 20, true); assert.equal(probes(), 8);
});

test('rich text bypasses the cache and font invalidation can replace the owner cache', t => {
  const { item, read, probes } = fixture(t);
  read();
  read(200, 20, false, new WeakMap()); assert.equal(probes(), 2);
  item.innerHTML = '<strong>Rich text</strong><br>Second line';
  read(); read(); assert.equal(probes(), 4);
});

test('continuous resizing keeps the per-element cache bounded', t => {
  const { item, cache, read } = fixture(t);
  for (let width = 100; width < 200; width++) read(width);
  assert.equal(cache.get(item).size, 8);
  for (let size = 12; size < 100; size++) read(200, size);
  assert.ok([...cache.get(item).values()].every(sizes => sizes.size <= 32));
});

test('cached reads restore live fitting flags and remove probes when callbacks throw', t => {
  const { item, cache, read, document } = fixture(t);
  item.setAttribute('data-canvas-text-fitted', '');
  item.setAttribute('data-canvas-auto-active', 'mobile');
  read(); read();
  assert.ok(item.hasAttribute('data-canvas-text-fitted'));
  assert.equal(item.getAttribute('data-canvas-auto-active'), 'mobile');
  assert.throws(() => measureText(item, 250, measure => {
    measure(20);
    throw new Error('callback failure');
  }, false, cache), /callback failure/);
  assert.equal(document.querySelector('.canvas-measure-text'), null);
});

test('area fitting reuses unchanged searches but responds to height, content, and loaded fonts', async t => {
  const { observeTextFit } = await import('../src/text-fit.mjs');
  const { item, document, probes } = fixture(t);
  const view = document.defaultView;
  const grid = document.createElement('div');
  grid.className = 'canvas__grid';
  document.body.append(grid);
  grid.append(item);
  item.textContent = 'Hi';
  item.setAttribute('data-canvas-text-fit', 'true');
  let height = 100;
  Object.defineProperty(item, 'clientWidth', { get: () => 200 });
  Object.defineProperty(item, 'clientHeight', { get: () => height });
  Object.defineProperty(view.HTMLElement.prototype, 'offsetHeight', {
    get() { return this.classList.contains('canvas-measure-text') ? parseFloat(this.style.fontSize) * 1.2 : 0; },
  });
  const frames = new Map();
  let frameId = 0;
  view.requestAnimationFrame = cb => { frames.set(++frameId, cb); return frameId; };
  view.cancelAnimationFrame = id => frames.delete(id);
  let resize;
  view.ResizeObserver = class {
    constructor(cb) { resize = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(document, 'fonts', { value: Object.assign(new view.EventTarget(), { ready: Promise.resolve() }) });
  const flush = async () => {
    await Promise.resolve();
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(cb => cb());
  };
  const dispose = observeTextFit(grid);
  t.after(dispose);
  await flush();
  const initialSize = parseFloat(item.style.getPropertyValue('--canvas-text-size'));
  const initialProbes = probes();
  item.style.setProperty('--canvas-free-top', '10px');
  await flush();
  assert.equal(probes(), initialProbes, 'movement reuses the fitted-font search');
  assert.equal(parseFloat(item.style.getPropertyValue('--canvas-text-size')), initialSize);
  height = 50;
  resize(); await flush();
  assert.ok(parseFloat(item.style.getPropertyValue('--canvas-text-size')) < initialSize);
  item.textContent = 'Different words';
  const beforeContent = probes(); await flush();
  assert.ok(probes() > beforeContent);
  const beforeFonts = probes();
  document.fonts.dispatchEvent(new view.Event('loadingdone')); await flush();
  assert.ok(probes() > beforeFonts, 'font metrics must be remeasured even if CSS is unchanged');
});
