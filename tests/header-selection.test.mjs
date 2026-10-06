import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeHomeItem, installHeaderSelection } from '../src/scripts/header-selection.js';
import { installNavigationGuard } from '../src/scripts/navigation-guard.js';

test('Contact wins at the bottom of a tall viewport while Career is still visible', () => {
  const sections = [{ item: 'career', top: -345, bottom: 352 }, { item: 'contact', top: 352, bottom: 847 }];
  assert.equal(activeHomeItem(sections, { height: 1000, scrollY: 7837, scrollHeight: 8837 }), 'contact');
  assert.equal(activeHomeItem(sections, { height: 1000, scrollY: 7700, scrollHeight: 8837 }), 'career');
});

test('section boundaries work in both scroll directions and the hero clears selection', () => {
  const viewport = { height: 800, scrollY: 2000, scrollHeight: 9000 };
  for (const item of ['about', 'projects', 'career', 'contact']) {
    assert.equal(activeHomeItem([{ item, top: 280, bottom: 700 }], viewport), item);
    assert.equal(activeHomeItem([{ item, top: 281, bottom: 700 }], viewport), null);
    assert.equal(activeHomeItem([{ item, top: -300, bottom: 280 }], viewport), null);
  }
  assert.equal(activeHomeItem([{ item: 'projects', top: 850, bottom: 4000 }], { ...viewport, scrollY: 0 }), null);
});

class Node extends EventTarget {
  constructor() {
    super();
    this.attrs = new Map(); this.dataset = {}; this.style = {}; this.scrollLeft = 0; this.scrollTop = 0;
    const names = new Set();
    this.classList = { add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name),
      toggle: (name, on) => on ? names.add(name) : names.delete(name) };
  }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, value); }
  removeAttribute(name) { this.attrs.delete(name); }
  getBoundingClientRect() { return this.rect; }
}

function makeHeader(variant = 'home') {
  const header = new Node(), nav = new Node(), line = new Node();
  header.dataset.variant = variant;
  nav.setAttribute('aria-label', variant === 'home' ? 'Primary navigation' : 'Resume navigation');
  nav.rect = { left: 600, top: 0, width: 400, height: 44 };
  const links = ['about', 'projects', 'career', 'resume', 'contact'].map((item, index) => {
    const link = new Node(), label = new Node();
    link.dataset.navItem = item;
    link.setAttribute('href', item === 'resume' ? '/resume/' : `${variant === 'home' ? '' : '/'}#${item === 'projects' ? 'project-matcher' : item}`);
    label.rect = { left: 610 + index * 70, top: 14, bottom: 30, width: 50, height: 16 };
    link.querySelector = () => label;
    link.label = label;
    if (variant === 'resume' && item === 'resume') link.setAttribute('aria-current', 'page');
    if (variant === 'project' && item === 'projects') link.setAttribute('aria-current', 'true');
    return link;
  });
  nav.querySelectorAll = () => links;
  nav.querySelector = selector => selector === '.header-selection' ? line
    : selector === 'a[aria-current] .nav-label' ? links.find(link => link.getAttribute('aria-current'))?.label
    : links.find(link => selector.includes(`"${link.dataset.navItem}"`));
  header.querySelector = selector => selector === 'nav' || selector === '#nav-links' ? nav : null;
  header.querySelectorAll = () => links;
  return { header, nav, line, links };
}

function setup() {
  const h = makeHeader(), document = new Node(), window = new Node(), reduced = new Node();
  reduced.matches = false;
  document.documentElement = new Node(); document.documentElement.scrollHeight = 9000;
  document.body = {}; document.hidden = false;
  const sections = new Map();
  document.getElementById = id => sections.get(id);
  document.querySelector = () => h.header;
  Object.assign(window, { innerHeight: 1000, scrollY: 2000, location: { href: 'http://localhost/' }, matchMedia: () => reduced });
  const frames = new Map(); let next = 0;
  window.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const observers = [];
  window.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {} disconnect() {}
  };
  window.ResizeObserver = window.MutationObserver;
  installNavigationGuard({ document, window, resetHandoff() {} });
  installHeaderSelection({ document, window });
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); };
  function select(item) {
    sections.clear();
    sections.set(item, { getBoundingClientRect: () => ({ top: 0, bottom: 800 }) });
    window.dispatchEvent(new Event('scroll')); flush();
  }
  function navigate(variant) {
    const destination = makeHeader(variant), controller = new AbortController();
    const prepare = new Event('astro:before-preparation'); prepare.signal = controller.signal;
    document.dispatchEvent(prepare);
    const event = new Event('astro:before-swap');
    event.signal = controller.signal;
    event.to = new URL('http://localhost/resume/');
    event.newDocument = { querySelector: () => destination.header };
    event.swap = () => { document.body = {}; };
    document.dispatchEvent(event);
    return { event, controller };
  }
  const load = () => { document.dispatchEvent(new Event('astro:page-load')); flush(); };
  return { ...h, document, window, reduced, frames, observers, select, navigate, load, flush, sections };
}

test('the same marker travels between homepage links and Resume, then back to Contact', () => {
  const h = setup();
  h.select('about'); const about = h.line.style.transform;
  h.select('career'); assert.notEqual(h.line.style.transform, about);
  assert.ok(h.line.classList.contains('is-traveling'));
  const marker = h.line;
  h.navigate('resume').event.swap(); h.load();
  assert.equal(h.line, marker);
  assert.equal(h.header.dataset.variant, 'resume');
  assert.equal(h.nav.getAttribute('aria-label'), 'Resume navigation');
  assert.equal(h.links[3].getAttribute('aria-current'), 'page');
  assert.equal(h.links[4].getAttribute('href'), '/#contact');
  assert.ok(h.line.classList.contains('is-traveling'));
  h.sections.clear(); h.sections.set('contact', { getBoundingClientRect: () => ({ top: 0, bottom: 800 }) });
  h.navigate('home').event.swap(); h.load();
  assert.equal(h.line, marker);
  assert.equal(h.links[4].getAttribute('aria-current'), 'true');
  assert.equal(h.links[4].getAttribute('href'), '#contact');
  assert.equal(h.links[3].getAttribute('aria-current'), null);
  assert.equal(h.frames.size, 0);
});

test('an aborted route swap cannot alter the surviving header or active section', () => {
  const h = setup(); h.select('about');
  const navigation = h.navigate('resume'); navigation.controller.abort();
  navigation.event.swap(); h.flush(); h.flush();
  assert.equal(h.header.dataset.variant, 'home');
  assert.equal(h.links[0].getAttribute('aria-current'), 'true');
  assert.equal(h.links[3].getAttribute('aria-current'), null);
  assert.equal(h.links[4].getAttribute('href'), '#contact');
});

test('menu reopening and resizing place the marker directly; reduced motion keeps state without travel', () => {
  const h = setup(); h.select('about');
  h.nav.hidden = true;
  h.observers[1].callback([{ target: h.nav, attributeName: 'hidden' }]); h.flush();
  assert.ok(!h.line.classList.contains('is-placed'));
  h.nav.hidden = false; h.select('career');
  assert.ok(!h.line.classList.contains('is-traveling'));
  h.select('about');
  h.reduced.matches = true; h.reduced.dispatchEvent(new Event('change')); h.flush();
  assert.ok(h.line.classList.contains('is-placed'));
  assert.ok(!h.line.classList.contains('is-traveling'));
  h.select('career'); assert.ok(!h.line.classList.contains('is-traveling'));
  h.window.dispatchEvent(new Event('resize')); h.flush();
  assert.equal(h.frames.size, 0);
});

test('restored pages retain the previous marker until the pending viewport is visible', () => {
  const h = setup(); h.select('career');
  const before = h.line.style.transform;
  h.document.documentElement.classList.add('hash-pending'); h.select('about');
  assert.equal(h.line.style.transform, before);
  h.document.documentElement.classList.remove('hash-pending');
  h.observers[0].callback(); h.flush();
  assert.equal(h.links[0].getAttribute('aria-current'), 'true');
  assert.ok(h.line.classList.contains('is-traveling'));
  h.window.__portfolioRestoringScroll = true;
  h.select('contact');
  assert.equal(h.links[0].getAttribute('aria-current'), 'true');
  delete h.window.__portfolioRestoringScroll;
  h.document.dispatchEvent(new Event('portfolio:scroll-restored')); h.flush();
  assert.equal(h.links[4].getAttribute('aria-current'), 'true');
});
