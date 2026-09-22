import test from 'node:test';
import assert from 'node:assert/strict';
import { gestureDocuments, gesturePoint, observeGesturePointer } from '../src/gesture-pointer.mjs';

function fixture() {
  const document = () => {
    const doc = new EventTarget();
    doc.defaultView = new EventTarget();
    doc.defaultView.document = doc;
    return doc;
  };
  const outer = document();
  const inner = document();
  inner.defaultView.frameElement = {
    ownerDocument: outer, clientLeft: 2, clientTop: 4,
    offsetWidth: 1000, offsetHeight: 800,
    getBoundingClientRect: () => ({ left: 100, top: 80, width: 500, height: 400 }),
  };
  const target = new EventTarget();
  target.ownerDocument = inner;
  let captured = false;
  target.setPointerCapture = () => { captured = true; };
  target.hasPointerCapture = () => captured;
  target.releasePointerCapture = () => { captured = false; target.dispatchEvent(new Event('lostpointercapture')); };
  const emit = (doc, type, values = {}) => {
    const event = Object.assign(new Event(type), { pointerId: 7, buttons: 1, clientX: 200, clientY: 300, view: doc.defaultView, ...values });
    doc.dispatchEvent(event);
  };
  const calls = [];
  const observer = observeGesturePointer({ pointerId: 7 }, target, {
    move: (e) => calls.push(['move', gesturePoint(e, inner)]),
    end: (e) => { calls.push(['end', e && gesturePoint(e, inner)]); observer.release(); },
    cancel: () => { calls.push(['cancel']); observer.release(); },
  });
  return { outer, inner, target, observer, emit, calls };
}

test('losing capture while held does not cancel, and release uses the final pointer', () => {
  const { inner, target, observer, emit, calls } = fixture();
  observer.capture();
  emit(inner, 'pointermove');
  target.releasePointerCapture(7);
  emit(inner, 'pointerup', { buttons: 0, clientX: 240, clientY: 360 });
  assert.deepEqual(calls, [['move', { x: 200, y: 300 }], ['end', { x: 240, y: 360 }]]);
  assert.equal(target.hasPointerCapture(7), false);
});

test('a quick press and release finishes even without a move event', () => {
  const { inner, emit, calls } = fixture();
  emit(inner, 'pointerup', { buttons: 0 });
  assert.deepEqual(calls, [['end', { x: 200, y: 300 }]]);
});

test('moving and releasing in editor chrome converts scaled iframe coordinates', () => {
  const { outer, inner, emit, calls } = fixture();
  assert.deepEqual(gestureDocuments(inner), [inner, outer]);
  emit(outer, 'pointermove', { clientX: 201, clientY: 232 });
  emit(outer, 'pointerup', { clientX: 251, clientY: 282, buttons: 0 });
  assert.deepEqual(calls, [['move', { x: 200, y: 300 }], ['end', { x: 300, y: 400 }]]);
  assert.deepEqual(gesturePoint({ clientX: 200, clientY: 300, view: inner.defaultView }, outer), { x: 201, y: 232 });
});

test('focus changing within the editor preserves the gesture; leaving the window settles it once', () => {
  const { outer, inner, emit, calls } = fixture();
  emit(inner, 'pointermove');
  inner.defaultView.dispatchEvent(new Event('blur'));
  assert.equal(calls.length, 1);
  outer.defaultView.dispatchEvent(new Event('blur'));
  emit(inner, 'pointerup', { buttons: 0 });
  assert.deepEqual(calls, [['move', { x: 200, y: 300 }], ['end', undefined]]);
});

test('returning after a missed release keeps the last preview, not the reentry position', () => {
  const { inner, emit, calls } = fixture();
  emit(inner, 'pointermove');
  emit(inner, 'pointermove', { buttons: 0, clientX: 900, clientY: 900 });
  assert.deepEqual(calls, [['move', { x: 200, y: 300 }], ['end', undefined]]);
});

test('unrelated pointers cannot move, finish, or cancel the active gesture', () => {
  const { inner, observer, emit, calls } = fixture();
  for (const type of ['pointermove', 'pointerup', 'pointercancel']) emit(inner, type, { pointerId: 9 });
  assert.deepEqual(calls, []);
  observer.release();
});

test('native cancellation rolls back and removes every listener', () => {
  const { inner, outer, target, observer, emit, calls } = fixture();
  observer.capture();
  emit(inner, 'pointercancel');
  emit(inner, 'pointerup');
  emit(outer, 'pointermove');
  outer.defaultView.dispatchEvent(new Event('blur'));
  assert.deepEqual(calls, [['cancel']]);
  assert.equal(target.hasPointerCapture(7), false);
});

test('switching tabs settles the last preview and failed capture still allows release', () => {
  const { outer, inner, target, observer, emit, calls } = fixture();
  target.setPointerCapture = () => { throw new Error('No active pointer'); };
  observer.capture();
  emit(inner, 'pointermove');
  outer.hidden = true;
  outer.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(calls, [['move', { x: 200, y: 300 }], ['end', undefined]]);
});
