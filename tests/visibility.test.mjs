import test from 'node:test';
import assert from 'node:assert/strict';
import { isHiddenOnViewport, toggleViewportVisibility } from '../src/visibility.mjs';

test('viewport visibility is independent and preserves unrelated block metadata', () => {
  const original = { name: 'Hero image', bindings: { url: { source: 'test' } } };
  const desktop = toggleViewportVisibility(original, 'desktop');
  const both = toggleViewportVisibility(desktop, 'mobile');
  assert.equal(isHiddenOnViewport(both, 'desktop'), true);
  assert.equal(isHiddenOnViewport(both, 'mobile'), true);
  assert.equal(isHiddenOnViewport(both, 'tablet'), false);
  assert.deepEqual(toggleViewportVisibility(toggleViewportVisibility(both, 'desktop'), 'mobile'), original);
  assert.equal(original.blockVisibility, undefined);
});

test('showing one viewport of a globally hidden block keeps the others hidden', () => {
  const original = { name: 'Alternate hero', blockVisibility: false };
  const shown = toggleViewportVisibility(original, 'mobile');
  assert.equal(isHiddenOnViewport(shown, 'mobile'), false);
  assert.equal(isHiddenOnViewport(shown, 'desktop'), true);
  assert.equal(isHiddenOnViewport(shown, 'tablet'), true);
  assert.equal(original.blockVisibility, false);
});

test('visibility edits preserve other conditions and survive serialization', () => {
  const original = { blockVisibility: { custom: 'preserve', viewport: { tablet: false } } };
  const next = JSON.parse(JSON.stringify(toggleViewportVisibility(original, 'desktop')));
  assert.deepEqual(next.blockVisibility, { custom: 'preserve', viewport: { tablet: false, desktop: false } });
  assert.deepEqual(toggleViewportVisibility(original, 'unknown'), original);
  assert.deepEqual(toggleViewportVisibility({ blockVisibility: true }, 'mobile'), { blockVisibility: { viewport: { mobile: false } } });
});
