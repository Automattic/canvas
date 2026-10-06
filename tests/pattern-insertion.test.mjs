import test from 'node:test';
import assert from 'node:assert/strict';
import { editablePatternBlocks } from '../src/pattern-insertion.mjs';

test('Canvas picker detaches only its own root while preserving names, bindings and explicit locks', () => {
  const child = { name: 'core/paragraph', attributes: { content: 'Keep me' }, innerBlocks: [] };
  const canvas = {
    name: 'tabor/canvas',
    attributes: {
      metadata: { patternName: 'tabor/example', name: 'Example', bindings: { custom: 'keep' } },
      templateLock: 'contentOnly',
      desktopRows: 18,
    },
    innerBlocks: [child],
  };
  const other = { name: 'core/group', attributes: { metadata: { patternName: 'theme/example' } }, innerBlocks: [canvas] };
  const [prepared, untouched] = editablePatternBlocks([canvas, other]);
  assert.equal(prepared.attributes.metadata.patternName, undefined);
  assert.deepEqual(prepared.attributes.metadata, { name: 'Example', bindings: { custom: 'keep' } });
  assert.equal(prepared.attributes.templateLock, 'contentOnly');
  assert.equal(prepared.innerBlocks, canvas.innerBlocks);
  assert.equal(untouched, other);
  assert.equal(canvas.attributes.metadata.patternName, 'tabor/example');
});

test('already independent Canvas sections retain their attributes and identity', () => {
  const canvas = { name: 'tabor/canvas', attributes: { metadata: { name: 'Authored section' } }, innerBlocks: [] };
  assert.equal(editablePatternBlocks([canvas])[0], canvas);
});
