import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Exercise the shipped event controller. Disclosure animation has its own tests.
const code = readFileSync(new URL('../src/scripts/bench-craft.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/, '');

class Element extends EventTarget {
  constructor() {
    super();
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force = !classes.has(name)) {
        force ? classes.add(name) : classes.delete(name);
        return force;
      }
    };
  }
  values = new Map();
  style = {
    transform: '',
    setProperty: (key, value) => this.values.set(key, value),
    removeProperty: key => this.values.delete(key)
  };
  rect = { top: 900, left: 0, width: 400, height: 500 };
  children = [];
  selected = null;
  getBoundingClientRect() { return this.rect; }
  setAttribute() {}
  append(node) { this.children.push(node); node.parent = this; }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  querySelector() { return this.selected; }
}

function setup({ phone = false } = {}) {
  const intro = new Element(), photos = new Element(), portrait = new Element();
  intro.classList.add('workshop-section-intro');
  const nav = new Element(); nav.id = 'nav-links'; nav.selected = new Element();
  nav.rect = { top: 0, left: 700, width: 500, height: 44 };
  nav.selected.rect = { top: 0, left: 780, width: 80, height: 44 };
  const modes = new Element(); modes.selected = new Element();
  const button = new Element(), icon = new Element(); button.selected = icon;
  const animations = [];
  icon.pose = 'none';
  icon.animate = frames => {
    let reject;
    const animation = { frames, finished: new Promise((_, no) => { reject = no; }),
      cancelled: false, cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
    animations.push(animation);
    return animation;
  };
  const document = new EventTarget();
  document.body = new Element(); document.hidden = false;
  document.querySelector = selector => ({
    '[data-workshop-hero]': new Element(), '.projects-grid': photos,
    '.portrait-card': portrait, '#nav-links': nav, '[data-matcher-modes]': modes
  })[selector] || null;
  document.querySelectorAll = selector => selector.includes('workshop-section-intro')
    ? [intro] : selector.includes('workshop-play-button') ? [button] : [];
  document.createElement = () => new Element();
  const reduced = new EventTarget(); reduced.matches = false;
  const window = new EventTarget(); window.innerHeight = 1000;
  const compact = new EventTarget(); compact.matches = phone;
  window.matchMedia = query => query.includes('reduce') ? reduced : compact;
  let nextFrame = 0;
  const frames = new Map();
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  runInNewContext(code, {
    document, window, navigator: {}, AbortController,
    MutationObserver: Observer, IntersectionObserver: Observer, ResizeObserver: Observer,
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: node => ({ transform: node.pose }),
    createDisclosure: () => () => {}, clearTimeout, setTimeout
  });
  const load = () => document.dispatchEvent(new Event('astro:page-load'));
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  const cleanup = () => document.dispatchEvent(new Event('astro:before-preparation'));
  load();
  return { document, window, reduced, compact, intro, photos, portrait, nav, modes, button, icon,
    animations, frames, observers, load, flush, cleanup };
}

test('fast and reverse scrolling seats from current geometry with one demand frame and no idle loop', () => {
  const p = setup();
  const initial = p.intro.values.get('--bench-heading-y');
  p.intro.rect.top = 100;
  for (let i = 0; i < 30; i++) p.window.dispatchEvent(new Event('scroll'));
  assert.equal(p.frames.size, 1);
  p.flush();
  assert.equal(p.intro.values.get('--bench-heading-y'), '0.00px');
  assert.equal(p.frames.size, 0);
  p.intro.rect.top = 900;
  p.window.dispatchEvent(new Event('scroll')); p.flush();
  assert.equal(p.intro.values.get('--bench-heading-y'), initial);
  assert.equal(p.frames.size, 0);
  p.cleanup();
});

test('repeated control input begins at the displayed pose; reduced motion cancels and seats', () => {
  const p = setup();
  p.button.dispatchEvent(new Event('click'));
  p.icon.pose = 'matrix(1, 0, 0, 1, 0, 2)';
  p.button.dispatchEvent(new Event('click'));
  assert.equal(p.animations[0].cancelled, true);
  assert.equal(p.animations[1].frames[0].transform, p.icon.pose);
  p.reduced.matches = true; p.reduced.dispatchEvent(new Event('change')); p.flush();
  assert.equal(p.animations[1].cancelled, true);
  assert.equal(p.document.body.classList.contains('bench-scroll-ready'), false);
  assert.equal(p.intro.values.get('--bench-heading-y'), '0.00px');
  assert.equal(p.photos.values.get('--bench-photo-y'), '0.00px');
  p.button.dispatchEvent(new Event('click'));
  assert.equal(p.animations.length, 2);
  p.cleanup();
});

test('repeat initialization and page cleanup release markers, observers, input handlers and queued work', () => {
  const p = setup();
  p.load(); p.load();
  assert.equal(p.nav.children.length, 0);
  assert.equal(p.modes.children.length, 1);
  p.button.dispatchEvent(new Event('click'));
  assert.equal(p.animations.length, 1);
  p.window.dispatchEvent(new Event('scroll'));
  p.cleanup();
  assert.equal(p.frames.size, 0);
  assert.equal(p.animations[0].cancelled, true);
  assert.equal(p.nav.children.length, 0);
  assert.equal(p.modes.children.length, 0);
  assert.equal(p.intro.values.size, 0);
  assert.equal(p.observers.every(observer => observer.disconnected), true);
  p.window.dispatchEvent(new Event('scroll'));
  p.button.dispatchEvent(new Event('click'));
  assert.equal(p.frames.size, 0);
  assert.equal(p.animations.length, 1);
});

test('phone content stays seated while controls retain feedback and desktop motion can return', () => {
  const p = setup({ phone: true });
  assert.equal(p.intro.values.get('--bench-heading-y'), '0.00px');
  assert.equal(p.photos.values.get('--bench-photo-y'), '0.00px');
  assert.equal(p.portrait.values.get('--bench-portrait-y'), '0.00px');
  p.intro.rect.top = 200; p.window.dispatchEvent(new Event('scroll')); p.flush();
  assert.equal(p.intro.values.get('--bench-heading-y'), '0.00px');
  p.button.dispatchEvent(new Event('click'));
  assert.equal(p.animations.length, 1);
  p.compact.matches = false; p.intro.rect.top = 900;
  p.compact.dispatchEvent(new Event('change')); p.flush();
  assert.ok(parseFloat(p.intro.values.get('--bench-heading-y')) > 0);
  p.cleanup();
});
