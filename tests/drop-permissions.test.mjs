import assert from 'node:assert/strict';
import test from 'node:test';
import { canDropBlocks } from '../src/drop-permissions.mjs';

const image = (clientId) => ({ clientId, name: 'core/image', attributes: {} });
const payload = (...ids) => ({ blocks: ids.map(image), move: true });
const store = ({ parents = {}, moveLocked = [], removeLocked = [], insertLocked = false, disabled = false, ancestors = [] } = {}) => ({
  getBlockRootClientId: (id) => parents[id] || '',
  getBlockEditingMode: () => disabled ? 'disabled' : 'default',
  getBlockParents: () => ancestors,
  canMoveBlocks: (ids) => ids.every((id) => !moveLocked.includes(id)),
  canRemoveBlocks: (ids) => ids.every((id) => !removeLocked.includes(id)),
  canInsertBlocks: () => !insertLocked,
  canInsertBlockType: () => !insertLocked,
});

test('native block drags can enter from the document or another parent', () => {
  assert.equal(canDropBlocks(payload('image'), 'canvas', store()), true);
  assert.equal(canDropBlocks(payload('image'), 'canvas', store({ parents: { image: 'group' } })), true);
});

test('a remove lock rejects a cross-parent drop even when moving is allowed', () => {
  for (const parent of ['', 'group', 'other-canvas']) {
    const selectors = store({ parents: { image: parent }, removeLocked: ['image'] });
    assert.equal(selectors.canMoveBlocks(['image']), true);
    assert.equal(canDropBlocks(payload('image'), 'canvas', selectors), false);
  }
});

test('a remove lock does not prevent repositioning within the same canvas', () => {
  assert.equal(canDropBlocks(payload('image'), 'canvas', store({
    parents: { image: 'canvas' }, removeLocked: ['image'], insertLocked: true,
  })), true);
});

test('a mixed batch checks removal only for incoming blocks and rejects the whole batch if one cannot leave', () => {
  const parents = { inside: 'canvas', outside: 'group' };
  assert.equal(canDropBlocks(payload('inside', 'outside'), 'canvas', store({ parents, removeLocked: ['inside'] })), true);
  assert.equal(canDropBlocks(payload('inside', 'outside'), 'canvas', store({ parents, removeLocked: ['outside'] })), false);
});

test('move locks and destination restrictions reject native drops', () => {
  assert.equal(canDropBlocks(payload('image'), 'canvas', store({ moveLocked: ['image'] })), false);
  assert.equal(canDropBlocks(payload('image'), 'canvas', store({ parents: { image: 'canvas' }, moveLocked: ['image'] })), false);
  assert.equal(canDropBlocks(payload('image'), 'canvas', store({ insertLocked: true })), false);
  assert.equal(canDropBlocks(payload('image'), 'canvas', store({ disabled: true })), false);
});

test('unsupported blocks, self-drops, ancestors, and empty payloads are rejected', () => {
  const unsupported = { clientId: 'audio', name: 'core/audio', attributes: {} };
  assert.equal(canDropBlocks({ blocks: [image('image'), unsupported], move: true }, 'canvas', store()), false);
  assert.equal(canDropBlocks(payload('canvas'), 'canvas', store()), false);
  assert.equal(canDropBlocks(payload('ancestor'), 'canvas', store({ ancestors: ['ancestor'] })), false);
  assert.equal(canDropBlocks(payload(), 'canvas', store()), false);
  assert.equal(canDropBlocks(null, 'canvas', store()), false);
});

test('existing Canvas groups can move internally but external groups remain unsupported', () => {
  const group = { clientId: 'group', name: 'core/group', attributes: { layout: { type: 'flex' } } };
  const drag = { blocks: [group], move: true };
  assert.equal(canDropBlocks(drag, 'canvas', store({ parents: { group: 'canvas' } })), true);
  assert.equal(canDropBlocks(drag, 'canvas', store()), false);
});

test('new blocks use insertion permissions without requiring a removable source', () => {
  const insert = { blocks: [image('new')] };
  assert.equal(canDropBlocks(insert, 'canvas', store({ removeLocked: ['new'] })), true);
  assert.equal(canDropBlocks(insert, 'canvas', store({ insertLocked: true })), false);
});
