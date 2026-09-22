import test from 'node:test';
import assert from 'node:assert/strict';
import { observeTouchSession } from '../src/touch-session.mjs';

function fixture(options = {}) {
  const doc = new EventTarget(), view = new EventTarget();
  doc.defaultView = view;
  view.document = doc;
  let now = 0, timerId = 0;
  const timers = new Map(), captures = new Set();
  view.setTimeout = (callback, delay) => { timers.set(++timerId, { callback, at: now + delay }); return timerId; };
  view.clearTimeout = id => timers.delete(id);
  const tick = ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  };
  const target = {
    ownerDocument: doc, contains: () => true,
    setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id),
  };
  const event = (type, values = {}) => Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 1, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: 100, clientY: 100, ...values,
  });
  const calls = [];
  let session;
  const finish = name => () => { calls.push(name); session.release(); };
  session = observeTouchSession(event('pointerdown'), target, {
    canMove: options.canMove ?? true, canPair: e => e.sameBlock === true,
    move: () => calls.push('move'), pair: () => calls.push('pair'), transform: () => calls.push('transform'),
    tap: finish('tap'), hold: finish('hold'), end: finish('end'), cancel: finish('cancel'),
  });
  const emit = (type, values) => { const e = event(type, values); doc.dispatchEvent(e); return e; };
  return { doc, view, session, calls, emit, tick, captures, timers };
}

test('a completed tap selects without starting a move or leaving a hold timer', () => {
  const f = fixture({ canMove: false });
  f.emit('pointerup', { buttons: 0 });
  f.tick(1000);
  assert.deepEqual(f.calls, ['tap']);
  assert.equal(f.timers.size, 0);
});

test('unselected swipes remain browser-scrollable and never become taps or holds', () => {
  const f = fixture({ canMove: false });
  assert.equal(f.emit('pointermove', { clientY: 120 }).defaultPrevented, false);
  f.tick(600);
  f.emit('pointercancel');
  assert.deepEqual(f.calls, ['cancel']);
  assert.equal(f.captures.size, 0);
});

test('a 500ms hold opens once, consumes native context menus, and suppresses its release click', () => {
  const f = fixture({ canMove: false });
  f.tick(499);
  assert.deepEqual(f.calls, []);
  f.tick(1);
  assert.deepEqual(f.calls, ['hold']);
  assert.equal(f.emit('contextmenu').defaultPrevented, true);
  f.emit('pointerup', { buttons: 0 });
  assert.equal(f.emit('click').defaultPrevented, true);
  assert.deepEqual(f.calls, ['hold']);
  f.emit('pointerdown');
  assert.equal(f.emit('click').defaultPrevented, false);
});

test('movement cancels long press and release settles the latest position once', () => {
  const f = fixture();
  f.emit('pointermove', { clientX: 107 });
  assert.deepEqual(f.calls, []);
  f.emit('pointermove', { clientX: 108 });
  f.tick(600);
  f.emit('pointerup', { clientX: 140, buttons: 0 });
  assert.deepEqual(f.calls, ['move', 'move', 'end']);
  assert.equal(f.captures.size, 0);
});

test('a second finger promotes movement to a transform; either release ends the whole session', () => {
  for (const releasedId of [1, 2]) {
    const f = fixture();
    f.emit('pointermove', { clientX: 120 });
    f.emit('pointerdown', { pointerId: 2, isPrimary: false, clientX: 180, sameBlock: true });
    f.emit('pointermove', { pointerId: 2, clientX: 200 });
    f.emit('pointerdown', { pointerId: 3, isPrimary: false, sameBlock: true });
    f.emit('pointermove', { pointerId: 3, clientX: 900 });
    f.tick(600);
    f.emit('pointerup', { pointerId: releasedId, buttons: 0 });
    const completed = [...f.calls];
    f.emit('pointermove', { pointerId: releasedId === 1 ? 2 : 1, clientX: 900 });
    f.emit('pointerup', { pointerId: releasedId === 1 ? 2 : 1, buttons: 0 });
    assert.deepEqual(completed, ['move', 'pair', 'transform', 'transform', 'end']);
    assert.deepEqual(f.calls, completed);
    assert.equal(f.captures.size, 0);
  }
});

test('a second touch on another block cancels the hold but cannot transform this block', () => {
  const f = fixture();
  f.emit('pointerdown', { pointerId: 2, isPrimary: false, sameBlock: false });
  f.tick(600);
  f.emit('pointermove', { pointerId: 2, clientX: 900 });
  assert.deepEqual(f.calls, []);
  f.emit('pointercancel');
  assert.deepEqual(f.calls, ['cancel']);
});

test('native cancellation rolls back a transform and external teardown clears timers', () => {
  const f = fixture();
  f.emit('pointerdown', { pointerId: 2, isPrimary: false, sameBlock: true });
  f.emit('pointermove', { pointerId: 2, clientX: 180 });
  f.emit('pointercancel', { pointerId: 2 });
  f.emit('pointerup');
  assert.deepEqual(f.calls, ['pair', 'transform', 'cancel']);
  f.tick(1000);
  assert.equal(f.timers.size, 0);
  const pending = fixture();
  pending.emit('pointermove', { clientX: 140 });
  pending.session.release();
  pending.tick(1000);
  assert.deepEqual(pending.calls, ['move']);
  assert.equal(pending.captures.size, 0);
  assert.equal(pending.timers.size, 0);
  const held = fixture();
  held.tick(500);
  held.session.destroy();
  assert.equal(held.timers.size, 0);
  assert.equal(held.emit('click').defaultPrevented, false);
});

test('scroll cancels a pending hold; leaving the window settles an active move', () => {
  const pending = fixture();
  pending.emit('scroll');
  pending.tick(600);
  pending.emit('pointerup');
  assert.deepEqual(pending.calls, ['cancel']);
  const active = fixture();
  active.emit('pointermove', { clientY: 130 });
  active.view.dispatchEvent(new Event('blur'));
  active.emit('pointerup');
  assert.deepEqual(active.calls, ['move', 'end']);
});
