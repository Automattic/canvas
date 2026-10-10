import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLOW_BLOCKS } from '../src/placement.mjs';
import { usesIntrinsicHeight, readableContentHeight, canResizeReadableContent, isHiddenContent } from '../src/automatic-content.mjs';
import { ownsCanvasTarget, ownsCanvasBlock } from '../src/canvas-scope.mjs';
import { withoutGrid } from '../src/grouping.mjs';

test('native flow blocks and nested Canvas measure their entire content box', () => {
  for (const name of FLOW_BLOCKS) {
    let removed = false;
    const clone = {
      removeAttribute() {}, setAttribute() {},
      classList: { add() {} }, style: { setProperty() {} },
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ width: 400, height: 900.1 }),
      ownerDocument: { defaultView: { getComputedStyle: () => ({ width: '400px', height: '900.1px', boxSizing: 'border-box' }) } },
      offsetHeight: 700, scrollHeight: 900,
      remove() { removed = true; },
    };
    const element = {
      classList: { contains: () => false },
      getAttribute: attribute => attribute === 'data-canvas-name' ? name : null,
      cloneNode: () => clone,
      matches: () => false,
      querySelector() { throw new Error('Intrinsic content must not measure only the first paragraph'); },
      parentElement: { append() {} },
    };
    assert.equal(usesIntrinsicHeight(element), true, name);
    assert.equal(canResizeReadableContent(element), true, name);
    assert.equal(readableContentHeight(element, 400), 901, name);
    assert.equal(removed, true);
  }
});

test('outer capture handlers leave nested Canvas controls to their own editor', () => {
  const outer = {}, inner = {};
  const target = { closest: () => inner };
  assert.equal(ownsCanvasTarget(outer, target), false);
  assert.equal(ownsCanvasTarget(inner, target), true);
  assert.equal(ownsCanvasTarget(outer, { closest: () => outer }), true);
});

test('theme-hidden native content does not expand its authored Canvas frame', () => {
  const child = {};
  const element = { childElementCount: 1, firstElementChild: child,
    ownerDocument: { defaultView: { getComputedStyle: node => ({ display: node === child ? 'none' : 'block' }) } },
    cloneNode() { throw new Error('Hidden content must not be cloned into visible measurement text'); },
  };
  assert.equal(isHiddenContent(element), true);
  assert.equal(readableContentHeight(element, 28.5), 0);
  element.childElementCount = 2;
  assert.equal(isHiddenContent(element), false, 'A hidden child must not hide a container with other visible content');
});

test('multi-paragraph native markup uses full-box rather than first-paragraph measurement', () => {
  const element = { classList: { contains: () => false }, getAttribute: () => 'core/post-excerpt', querySelectorAll: () => [{}, {}] };
  assert.equal(usesIntrinsicHeight(element), true);
  element.querySelectorAll = () => [{}];
  assert.equal(usesIntrinsicHeight(element), false);
});

test('native range ownership stops at the nearest Canvas and excludes native flow descendants', () => {
  const blocks = { outer: { name: 'tabor/canvas' }, inner: { name: 'tabor/canvas' }, group: { name: 'core/group', attributes: { canvas: { group: 1 } } }, query: { name: 'core/query' } };
  const paths = { child: ['outer'], nestedChild: ['outer', 'query', 'inner'], nativeChild: ['outer', 'query'], groupedChild: ['outer', 'group'] };
  const store = { getBlockParents: id => paths[id], getBlockName: id => blocks[id].name, getBlock: id => blocks[id] };
  assert.equal(ownsCanvasBlock(store, 'outer', 'child'), true);
  assert.equal(ownsCanvasBlock(store, 'outer', 'groupedChild'), true);
  assert.equal(ownsCanvasBlock(store, 'outer', 'nestedChild'), false);
  assert.equal(ownsCanvasBlock(store, 'inner', 'nestedChild'), true);
  assert.equal(ownsCanvasBlock(store, 'outer', 'nativeChild'), false);
});

test('nested grid boundaries reset precise frames instead of inheriting outer content height', () => {
  const css = readFileSync(new URL('../src/style.scss', import.meta.url), 'utf8');
  const grid = css.slice(css.indexOf('\t.canvas__grid {'), css.indexOf('\n\t&[data-canvas-canvas] .canvas__grid'));
  for (const dimension of ['width', 'height', 'left', 'top']) {
    assert.ok(grid.includes(`--canvas-free-${dimension}: initial;`), dimension);
  }
});

test('releasing a native flow container preserves nested Canvas child coordinates', () => {
  const paragraph = { name: 'core/paragraph', attributes: { canvas: { desktop: { row: 4, column: 2 } } }, innerBlocks: [] };
  const canvas = { name: 'tabor/canvas', attributes: { desktopRows: 8, canvas: { desktop: { row: 2 } } }, innerBlocks: [paragraph] };
  const query = { name: 'core/query', attributes: { canvas: { desktop: { row: 6 } } }, innerBlocks: [canvas] };
  const released = withoutGrid(query);
  assert.equal(released.attributes.canvas, undefined);
  assert.equal(released.innerBlocks[0].attributes.canvas, undefined);
  assert.equal(released.innerBlocks[0].attributes.desktopRows, 8);
  assert.equal(released.innerBlocks[0].innerBlocks[0], paragraph);
});
