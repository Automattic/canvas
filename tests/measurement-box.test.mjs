import test from 'node:test';
import assert from 'node:assert/strict';
import { intrinsicBoxSize } from '../src/measurement-box.mjs';

test('intrinsic dimensions ignore transformed screen bounds and keep subpixel height', () => {
  const element = {
    ownerDocument: { defaultView: { getComputedStyle: () => ({ width: '400px', height: '48.25px', boxSizing: 'border-box' }) } },
    getBoundingClientRect() { throw new Error('Rotated visual bounds are not intrinsic layout dimensions'); },
    offsetWidth: 400, offsetHeight: 48,
  };
  assert.deepEqual(intrinsicBoxSize(element), { width: 400, height: 48.25 });
});

test('content-box measurement includes native border and padding', () => {
  const element = { ownerDocument: { defaultView: { getComputedStyle: () => ({ width: '400px', height: '48.25px', boxSizing: 'content-box', paddingTop: '2.5px', paddingBottom: '3px', borderTopWidth: '1px', borderBottomWidth: '1px' }) } } };
  assert.deepEqual(intrinsicBoxSize(element), { width: 400, height: 55.75 });
});
