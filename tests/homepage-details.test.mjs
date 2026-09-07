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
    willChange: '',
    values: new Map(),
    setProperty(key, value) { this.values.set(key, value); },
    removeProperty(key) { this.values.delete(key); }
  };
  attrs = new Map();
  children = new Map();
  querySelector(selector) { return this.children.get(selector) ?? null; }
  getBoundingClientRect() { return { top: 1200, left: 0, width: 1000, height: 700 }; }
  setAttribute(key, value) { this.attrs.set(key, value); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
}

function setup({
  hash = '', scrollY = 0, now = 100, reduced = false, played = false, fine = true,
  hidden = false, pendingHash = '', storedY = 0, sessionPending = '', navType = 'navigate',
  hashPendingClass = false, withCards = false
} = {}) {
  const journey = new Node('is-intro');
  const stage = new Node();
  const depth = new Node();
  const title = new Node();
  const availability = new Node();
  const actions = new Node();
  const bench = new Node();
  const trace = new Node();
  bench.getBoundingClientRect = () => ({ top: 0, left: 0, width: 1000, height: 700 });
  journey.children = new Map([
    ['[data-journey-stage]', stage],
    ['[data-journey-depth]', depth],
    ['[data-animate-title]', title],
    ['[data-entry-availability]', availability],
    ['[data-entry-actions]', actions],
    ['.project-journey-stage', bench],
    ['.trace-path', trace]
  ]);

  const animationRecords = [];
  for (const node of [stage, title, availability, actions]) {
    node.animate = (keyframes, options) => {
      animationRecords.push({ node, keyframes, options });
      return { finished: Promise.resolve(), finish() {}, cancel() {} };
    };
  }

  const about = new Node();
  const aboutPortrait = new Node();
  const aboutHeading = new Node();
  const aboutBody = new Node();
  const aboutContact = new Node();
  const career = new Node();
  const roles = [new Node(), new Node(), new Node()];
  const cards = withCards ? [new Node(), new Node()] : [];

  const motion = new EventTarget();
  motion.matches = reduced;
  const pointer = new EventTarget();
  pointer.matches = fine;
  const documentElement = new Node();
  if (hashPendingClass) documentElement.classList.add('hash-pending');
  const document = new EventTarget();
  document.readyState = 'complete';
  document.hidden = hidden;
  document.documentElement = documentElement;
  const named = new Map([
    ['[data-journey]', journey],
    ['.trace-path', trace],
    ['[data-cinematic-about]', about],
    ['[data-cinematic-about-portrait]', aboutPortrait],
    ['[data-cinematic-about-heading]', aboutHeading],
    ['[data-cinematic-about-body]', aboutBody],
    ['[data-cinematic-about-contact]', aboutContact],
    ['[data-cinematic-career]', career]
  ]);
  document.querySelector = selector => named.get(selector) ?? journey.children.get(selector) ?? null;
  document.querySelectorAll = selector => {
    if (selector.includes('data-cinematic-role')) return roles;
    if (selector.includes('data-cinematic-card')) return cards;
    return [];
  };
  const window = new EventTarget();
  window.scrollY = scrollY;
  window.innerHeight = 900;
  window.matchMedia = query => query.includes('prefers-reduced-motion') ? motion : pointer;
  if (pendingHash) window.__portfolioHash = pendingHash;
  if (storedY) window.__portfolioScrollY = storedY;

  const stored = new Map(played ? [['homepage-details-entry-played', '1']] : []);
  if (sessionPending) stored.set('portfolio-scroll', sessionPending);
  if (storedY) stored.set('portfolio-scroll-y', JSON.stringify({ path: '/', y: storedY }));
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
  const flushAll = (start = 0, step = 16, limit = 1600) => {
    let time = start;
    while (frames.size && time <= limit) {
      flushFrame(time);
      time += step;
    }
    return time;
  };

  class Observer {
    static instances = [];
    constructor(callback) { this.callback = callback; this.disconnected = false; this.constructor.instances.push(this); }
    observe(target) { this.target = target; }
    unobserve() {}
    disconnect() { this.disconnected = true; }
    fire(target = this.target || journey) { this.callback([{ target, isIntersecting: true }]); }
  }
  class Mutation extends Observer {}
  class Intersection extends Observer {}
  Mutation.instances = [];
  Intersection.instances = [];

  runInNewContext(code, {
    window, document, location: { hash, pathname: '/' },
    performance: { now: () => now, getEntriesByType: type => type === 'navigation' ? [{ type: navType }] : [], navigation: { type: navType === 'back_forward' ? 2 : 0 } },
    sessionStorage, AbortController, MutationObserver: Mutation, IntersectionObserver: Intersection,
    requestAnimationFrame, cancelAnimationFrame, console, Math, Promise
  });

  return {
    journey, stage, depth, title, availability, actions, trace, motion, pointer, document, frames,
    flushFrame, flushAll, mutations: Mutation.instances, intersections: Intersection.instances,
    animationCount: () => animationRecords.length, animationRecords, cards, aboutPortrait, career, roles,
    documentElement
  };
}

test('idempotent initial load and astro:page-load keep one entrance', async () => {
  const page = setup();
  await settle();
  assert.equal(page.animationCount(), 4);
  page.document.dispatchEvent(new Event('astro:page-load'));
  await settle();
  assert.equal(page.animationCount(), 4);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('entrance is one-shot for the session', async () => {
  const first = setup();
  await settle();
  assert.equal(first.animationCount(), 4);
  first.document.dispatchEvent(new Event('astro:before-preparation'));
  const again = setup({ played: true });
  await settle();
  assert.equal(again.animationCount(), 0);
  again.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('entrance eligibility excludes hash, pending restoration, stored scroll, Back navigation, late initialization, hidden documents, and reduced motion', () => {
  for (const options of [
    { hash: '#projects' },
    { pendingHash: '#about' },
    { sessionPending: '#projects' },
    { hashPendingClass: true },
    { storedY: 240 },
    { scrollY: 200 },
    { navType: 'back_forward' },
    { now: 1200 },
    { hidden: true },
    { reduced: true },
    { played: true }
  ]) {
    const page = setup(options);
    assert.equal(page.animationCount(), 0, JSON.stringify(options));
    page.document.dispatchEvent(new Event('astro:before-preparation'));
  }
});

test('signal trace completes in sync with the entrance settle', async () => {
  const page = setup();
  await settle();
  assert.equal(page.animationCount(), 4);
  const settleMs = page.animationRecords.map(record => (record.options.duration || 0) + (record.options.delay || 0));
  assert.ok(settleMs.some(ms => ms >= 760 && ms <= 840));
  page.flushAll(0, 16, 900);
  assert.match(page.trace.getAttribute('d') || '', /^M2\.0 /);
  assert.doesNotMatch(page.trace.getAttribute('d') || '', /10\.\d{2} /);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('pointer tracking binds only while a fine desktop pointer matches', () => {
  const page = setup({ played: true, fine: false });
  const move = new Event('pointermove');
  Object.defineProperties(move, { clientX: { value: 900 }, clientY: { value: 600 } });
  page.journey.dispatchEvent(move);
  assert.equal(page.frames.size, 0);
  page.pointer.matches = true;
  page.pointer.dispatchEvent(new Event('change'));
  page.journey.dispatchEvent(move);
  assert.equal(page.frames.size, 1);
  page.pointer.matches = false;
  page.pointer.dispatchEvent(new Event('change'));
  assert.equal(page.depth.style.transform, '');
  assert.equal(page.frames.size, 0);
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
  assert.equal(page.stage.classList.contains('is-lit'), false);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('pointer exit, visibility, reduced motion, and breakpoint changes cancel spatial motion', () => {
  const page = setup({ played: true });
  const move = new Event('pointermove');
  Object.defineProperties(move, { clientX: { value: 900 }, clientY: { value: 600 } });
  page.journey.dispatchEvent(move);
  page.flushFrame(16);
  page.journey.dispatchEvent(new Event('pointerleave'));
  page.flushAll(32, 16, 400);
  assert.equal(page.depth.style.transform, '');
  page.journey.dispatchEvent(move);
  page.flushFrame(16);
  page.document.hidden = true;
  page.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(page.depth.style.transform, '');
  assert.equal(page.frames.size, 0);
  page.document.hidden = false;
  page.journey.dispatchEvent(move);
  page.flushFrame(16);
  page.motion.matches = true;
  page.motion.dispatchEvent(new Event('change'));
  assert.equal(page.depth.style.transform, '');
  assert.equal(page.frames.size, 0);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('cleanup cancels animations, observers, listeners, and all animation frames', () => {
  const page = setup();
  assert.ok(page.frames.size >= 1);
  page.journey.dispatchEvent(Object.assign(new Event('pointerleave')));
  page.document.dispatchEvent(new Event('astro:before-preparation'));
  assert.equal(page.frames.size, 0);
  assert.ok([...page.mutations, ...page.intersections].every(observer => observer.disconnected));
  assert.equal(page.depth.style.transform, '');
  assert.equal(page.stage.classList.contains('is-lit'), false);
});

test('below-fold career roles arm pending and enter independently', () => {
  const page = setup({ played: true });
  assert.ok(page.roles.every(role => role.classList.contains('cinematic-pending')));
  assert.ok(page.roles.every(role => !role.classList.contains('cinematic-in')));
  const roleObservers = page.intersections.filter(observer => page.roles.includes(observer.target));
  assert.equal(roleObservers.length, 3);
  roleObservers[0].fire();
  assert.equal(page.roles[0].classList.contains('cinematic-in'), true);
  assert.equal(page.roles[1].classList.contains('cinematic-pending'), true);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('career reveals wait for hash restoration to finish', () => {
  const page = setup({ played: true, hashPendingClass: true });
  assert.ok(page.roles.every(role => !role.classList.contains('cinematic-pending')));
  page.documentElement.classList.remove('hash-pending');
  const restore = page.mutations.find(observer => observer.target === page.documentElement);
  assert.ok(restore);
  restore.fire();
  assert.ok(page.roles.every(role => role.classList.contains('cinematic-pending')));
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('touch activation on cinematic cards is not prevented', () => {
  const page = setup({ played: true, withCards: true });
  const click = new Event('click', { cancelable: true });
  page.cards[0].dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
  page.document.dispatchEvent(new Event('astro:before-preparation'));
});
