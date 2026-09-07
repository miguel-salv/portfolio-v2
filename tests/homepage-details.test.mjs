import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('../src/scripts/homepage-details.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

class ClassList {
  constructor(...tokens) { this.tokens = new Set(tokens); }
  add(...tokens) { tokens.forEach(token => this.tokens.add(token)); }
  remove(...tokens) { tokens.forEach(token => this.tokens.delete(token)); }
  contains(token) { return this.tokens.has(token); }
  toggle(token, force) {
    const active = force ?? !this.contains(token);
    active ? this.add(token) : this.remove(token);
    return active;
  }
}

class Node extends EventTarget {
  constructor(...classes) { super(); this.classList = new ClassList(...classes); }
  style = {
    transform: '',
    values: new Map(),
    setProperty(key, value) { this.values.set(key, value); },
    removeProperty(key) { this.values.delete(key); }
  };
  children = new Map();
  querySelector(selector) { return this.children.get(selector) ?? null; }
  getBoundingClientRect() { return { top: 1200, left: 0, width: 1000, height: 700 }; }
}

function setup({ hash = '', scrollY = 0, now = 100, reduced = false, played = false } = {}) {
  const journey = new Node('is-intro');
  const entry = new Node();
  const depth = new Node();
  const title = new Node();
  const availability = new Node();
  const actions = new Node();
  const stage = new Node();
  stage.getBoundingClientRect = () => ({ top: 0, left: 0, width: 1000, height: 700 });
  journey.children = new Map([
    ['[data-journey-artwork-entry]', entry],
    ['[data-journey-artwork-depth]', depth],
    ['[data-animate-title]', title],
    ['.journey-availability', availability],
    ['.hero-actions', actions],
    ['.project-journey-stage', stage]
  ]);

  let animationCount = 0;
  for (const node of [entry, title, availability, actions]) {
    node.animate = () => {
      animationCount++;
      return { finished: Promise.resolve(), finish() {}, cancel() {} };
    };
  }

  const motion = new EventTarget();
  motion.matches = reduced;
  const pointer = new EventTarget();
  pointer.matches = true;
  const document = new EventTarget();
  document.readyState = 'complete';
  document.hidden = false;
  const underline = new Node();
  document.querySelector = selector => selector === '[data-journey]' ? journey : selector === '[data-personal-underline]' ? underline : null;
  document.querySelectorAll = () => [];
  const window = new EventTarget();
  window.scrollY = scrollY;
  window.innerHeight = 900;
  window.matchMedia = query => query.includes('prefers-reduced-motion') ? motion : pointer;

  const stored = new Map(played ? [['homepage-details-entry-played', '1']] : []);
  const sessionStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  let nextFrame = 0;
  const frames = new Map();
  const requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
  const cancelAnimationFrame = id => frames.delete(id);
  const flushFrame = time => {
    const first = frames.entries().next().value;
    if (!first) return;
    const [id, callback] = first;
    frames.delete(id);
    callback(time);
  };

  class Observer {
    static instances = [];
    constructor(callback) { this.callback = callback; this.disconnected = false; this.constructor.instances.push(this); }
    observe() {}
    unobserve() {}
    disconnect() { this.disconnected = true; }
    fire(target = journey) { this.callback([{ target, isIntersecting: true }]); }
  }

  class Mutation extends Observer {}
  class Intersection extends Observer {}
  Mutation.instances = [];
  Intersection.instances = [];

  runInNewContext(code, {
    window, document, location: { hash }, performance: { now: () => now }, sessionStorage,
    AbortController, MutationObserver: Mutation, IntersectionObserver: Intersection,
    requestAnimationFrame, cancelAnimationFrame, console, Math, Promise
  });

  return {
    journey, entry, depth, motion, pointer, document, frames, flushFrame,
    mutations: Mutation.instances, intersections: Intersection.instances,
    animationCount: () => animationCount
  };
}

test('Astro reinitialization keeps the entrance one-shot and pointer listeners singular', async () => {
  const page = setup();
  await settle();
  assert.equal(page.animationCount(), 4);
  page.document.dispatchEvent(new Event('astro:page-load'));
  await settle();
  assert.equal(page.animationCount(), 4);
  const move = new Event('pointermove');
  Object.defineProperties(move, { clientX: { value: 900 }, clientY: { value: 600 } });
  page.journey.dispatchEvent(move);
  assert.equal(page.frames.size, 1);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('leaving the introduction resets depth and cancels pending frames', () => {
  const page = setup({ played: true });
  const move = new Event('pointermove');
  Object.defineProperties(move, { clientX: { value: 950 }, clientY: { value: 650 } });
  page.journey.dispatchEvent(move);
  page.flushFrame(16);
  assert.notEqual(page.depth.style.transform, '');
  assert.equal(page.frames.size, 1);
  page.journey.classList.remove('is-intro');
  page.mutations.at(-1).fire();
  assert.equal(page.depth.style.transform, '');
  assert.equal(page.frames.size, 0);
  assert.equal(page.entry.classList.contains('is-lit'), false);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('a reduced-motion change cancels spatial motion immediately', () => {
  const page = setup({ played: true });
  const move = new Event('pointermove');
  Object.defineProperties(move, { clientX: { value: 900 }, clientY: { value: 600 } });
  page.journey.dispatchEvent(move);
  page.flushFrame(16);
  page.motion.matches = true;
  page.motion.dispatchEvent(new Event('change'));
  assert.equal(page.depth.style.transform, '');
  assert.equal(page.frames.size, 0);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('cleanup disconnects observers and leaves no animation-frame callbacks', () => {
  const page = setup({ played: true });
  page.journey.dispatchEvent(Object.assign(new Event('pointerleave')));
  assert.equal(page.frames.size, 1);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
  assert.equal(page.frames.size, 0);
  assert.ok([...page.mutations, ...page.intersections].every(observer => observer.disconnected));
});

test('entrance eligibility excludes hash, restored scroll, late initialization, and a played session', () => {
  for (const options of [
    { hash: '#projects' },
    { scrollY: 200 },
    { now: 1200 },
    { played: true }
  ]) {
    const page = setup(options);
    assert.equal(page.animationCount(), 0);
    page.document.dispatchEvent(new Event('astro:before-preparation'));
  }
});
