import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionNavigation } from '../src/scripts/section-navigation.js';

globalThis.CustomEvent ||= class extends Event { constructor(type, options) { super(type); this.detail = options?.detail; } };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup({ reduce = false } = {}) {
  const document = new EventTarget(), window = new EventTarget(), reduced = new EventTarget();
  const nodes = [], animations = [], frames = [], moves = [], addresses = [], events = [];
  let now = 0, decoded = true;
  reduced.matches = reduce;
  document.documentElement = { classList: { add() {}, remove() {} } };
  document.body = { append: node => nodes.push(node) };
  document.createElement = () => ({ opacity: 0, setAttribute() {}, remove() { this.removed = true; },
    animate(keyframes) {
      let resolve;
      const animation = { finish: () => { this.opacity = keyframes.at(-1).opacity; resolve(); }, cancel: () => resolve(), finished: new Promise(r => { resolve = r; }) };
      animations.push(animation); return animation;
    }
  });
  window.getComputedStyle = node => ({ opacity: node.opacity });
  window.performance = { now: () => now };
  window.requestAnimationFrame = callback => frames.push(callback);
  document.addEventListener('portfolio:section-navigation-settle', event => event.detail.ready(() => decoded));
  document.addEventListener('portfolio:section-navigation-end', () => events.push('end'));
  const nav = createSectionNavigation({ document, window, reduced, move: hash => moves.push(hash),
    updateHistory: url => addresses.push(url.hash), reveal() {} });
  return { nav, window, reduced, nodes, moves, addresses, events, animations,
    ready: value => { decoded = value; }, finish: async () => { animations.at(-1).finish(); await flush(); },
    frame: async (elapsed = 16) => { now += elapsed; frames.splice(0).forEach(callback => callback(now)); await flush(); },
    go: hash => nav.go({ hash }, hash.slice(1))
  };
}

test('the destination moves once under an opaque cover and waits for its decoded pose', async () => {
  const h = setup(); h.ready(false); const done = h.go('#project-matcher');
  assert.deepEqual(h.moves, []);
  await h.finish();
  assert.deepEqual(h.moves, ['#project-matcher']);
  assert.equal(h.nodes[0].opacity, 1);
  await h.frame(); assert.equal(h.animations.length, 1);
  h.ready(true); await h.frame(); await h.finish(); await done;
  assert.deepEqual(h.addresses, ['#project-matcher']);
  assert.equal(h.nav.active, false); assert.equal(h.nodes[0].removed, true);
});

test('a newer header click replaces an unfinished destination instead of replaying it', async () => {
  const h = setup(); const old = h.go('#project-matcher'), latest = h.go('#contact');
  await flush(); await h.finish(); await h.frame(); await h.finish(); await Promise.all([old, latest]);
  assert.deepEqual(h.moves, ['#contact']);
  assert.deepEqual(h.addresses, ['#contact']);
  assert.equal(h.events.length, 1);
});

test('manual scroll cancels the fade and cannot trigger a delayed jump', async () => {
  const h = setup(); const done = h.go('#project-matcher');
  h.window.dispatchEvent(new Event('wheel')); await done;
  assert.deepEqual(h.moves, []); assert.deepEqual(h.addresses, []);
  assert.equal(h.nodes[0].removed, true);
  assert.equal(h.window.__portfolioSectionNavigation, undefined);
});

test('a stalled decoder cannot leave the page covered', async () => {
  const h = setup(); h.ready(false); const done = h.go('#project-matcher');
  await h.finish(); await h.frame(421); await h.finish(); await done;
  assert.equal(h.nav.active, false); assert.equal(h.nodes[0].removed, true);
});

test('reduced motion goes directly to the destination without a fade', async () => {
  const h = setup({ reduce: true }); const done = h.go('#contact');
  await flush(); await h.frame(); await done;
  assert.deepEqual(h.moves, ['#contact']);
  assert.equal(h.nodes.length, 0); assert.equal(h.animations.length, 0);
  assert.equal(h.nav.active, false);
});
