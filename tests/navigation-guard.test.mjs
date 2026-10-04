import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installNavigationGuard } from '../src/scripts/navigation-guard.js';

function setup() {
  const document = new EventTarget();
  document.body = { page: 'home' };
  const frames = new Map();
  let nextFrame = 0, resets = 0, loads = 0;
  const window = {
    location: { href: 'http://localhost/#project-matcher' },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  document.addEventListener('astro:page-load', () => loads++);
  installNavigationGuard({ document, window, resetHandoff: () => resets++ });
  function prepare() {
    const controller = new AbortController();
    const event = new Event('astro:before-preparation');
    event.signal = controller.signal;
    document.dispatchEvent(event);
    return { controller, event };
  }
  function swap(preparation) {
    const event = new Event('astro:before-swap');
    event.signal = preparation.controller.signal;
    event.to = new URL('http://localhost/project-impedance.html');
    event.swap = () => { document.body = { page: 'matcher' }; };
    document.dispatchEvent(event);
    return event;
  }
  const flush = () => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(fn => fn());
  };
  return { document, window, frames, prepare, swap, flush,
    resets: () => resets, loads: () => loads };
}

test('ordinary project navigation retains its original swap and destination', () => {
  const h = setup(), event = h.swap(h.prepare());
  event.swap();
  assert.equal(h.document.body.page, 'matcher');
  assert.equal(event.to.pathname, '/project-impedance.html');
  assert.equal(h.resets(), 0);
});

test('Back between preparation and deferred swap cannot commit the stale project', () => {
  const h = setup(), preparation = h.prepare(), source = h.document.body;
  const event = h.swap(preparation);
  preparation.controller.abort();
  h.window.location.href = 'http://localhost/#project-vehicle';
  event.swap();
  assert.equal(h.document.body, source);
  assert.equal(event.to.href, h.window.location.href);
  assert.equal(h.resets(), 1);
});

test('cancelling during loading resumes source controls and releases the handoff once', () => {
  const h = setup(), preparation = h.prepare();
  preparation.controller.abort(); preparation.controller.abort(); h.flush();
  assert.equal(h.loads(), 1); assert.equal(h.resets(), 1);
  assert.equal(h.frames.size, 0);
});

test('a newer navigation suppresses the abandoned source-page resume', () => {
  const h = setup(), old = h.prepare();
  old.controller.abort(); h.prepare(); h.flush();
  assert.equal(h.loads(), 0); assert.equal(h.resets(), 0);
});

test('late abort after a committed swap cannot reinitialize the old page', () => {
  const h = setup(), preparation = h.prepare();
  h.swap(preparation).swap(); preparation.controller.abort(); h.flush();
  assert.equal(h.document.body.page, 'matcher');
  assert.equal(h.loads(), 0); assert.equal(h.resets(), 0);
});

test('completed swaps release the cancellation frame before their normal page load', () => {
  const h = setup(), preparation = h.prepare();
  preparation.controller.abort();
  h.document.dispatchEvent(new Event('astro:after-swap')); h.flush();
  assert.equal(h.loads(), 0); assert.equal(h.frames.size, 0);
});
