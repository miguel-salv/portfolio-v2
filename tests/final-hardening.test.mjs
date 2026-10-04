import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const load = (file, scope) => runInNewContext(readFileSync(new URL(`../src/scripts/${file}`, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export function', 'function'), scope);

class Node extends EventTarget {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = new Map(); this.isConnected = true; this.style = { setProperty() {} }; this.innerHTML = '';
    const classes = new Set();
    this.classList = { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle: (x, on) => { if (on ?? !classes.has(x)) classes.add(x); else classes.delete(x); } };
  }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  removeAttribute(key) { this.attrs.delete(key); }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  replaceChildren(...nodes) { this.children = nodes; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.isConnected = false; }
  contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
  querySelectorAll(selector) {
    const nodes = this.children.flatMap(child => [child, ...(child.querySelectorAll?.('*') || [])]);
    if (selector === '*') return nodes;
    if (selector === 'kicanvas-embed.pcb-view') return nodes.filter(child => child.tagName === 'KICANVAS-EMBED');
    return nodes.filter(child => selector === 'button' ? child.tagName === 'BUTTON' : selector === 'style[data-portfolio-controls]' ? child.tagName === 'STYLE' && 'portfolioControls' in child.dataset : selector === 'figcaption' ? child.tagName === 'FIGCAPTION' : selector === '.hardware-demo-frame' ? child.className === 'hardware-demo-frame' : false);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { top: 20, bottom: 200 }; }
  closest() { return null; }
  setPointerCapture(id) { this.captured = id; }
}

function selectionHarness(reduced = false) {
  const frame = new Node(); const document = { activeElement: null };
  const views = ['schematic', 'layout'].map(name => { const view = new Node('kicanvas-embed'); view.dataset.view = name; frame.appendChild(view); return view; });
  views[0].classList.add('active');
  const buttons = ['schematic', 'layout'].map(name => { const button = new Node('button'); button.dataset.pcbView = name; return button; });
  const requests = [], timers = new Map(), callbacks = []; let timer = 0, failures = 0, reveals = 0;
  const scope = { document }; load('pcb-view-selection.js', scope);
  const selection = scope.createPcbViewSelection(frame, buttons, {
    prepare(name) { const gate = deferred(); requests.push({ name, ...gate }); return gate.promise; },
    reveal() { reveals++; }, fail() { failures++; }, reduced: () => reduced,
    setTimer(fn) { callbacks.push(fn); timers.set(++timer, fn); return timer; }, clearTimer(id) { timers.delete(id); },
  });
  return { frame, views, buttons, document, requests, timers, callbacks, selection, get failures() { return failures; }, get reveals() { return reveals; } };
}

test('a newer PCB request wins even when the older board load completes last', async () => {
  const h = selectionHarness(); const older = h.selection.request('layout'), newer = h.selection.request('schematic');
  h.requests[1].resolve(true); await newer; h.requests[0].resolve(true); await older;
  assert.equal(h.views[0].classList.contains('active'), true); assert.equal(h.views[1].classList.contains('active'), false);
  assert.equal(h.views[1].inert, true); assert.equal(h.buttons[0].getAttribute('aria-pressed'), 'true'); assert.equal(h.reveals, 1);
});

test('rapid PCB reversals cannot be hidden by an obsolete exit completion', async () => {
  const h = selectionHarness(); let request = h.selection.request('layout'); h.requests[0].resolve(true); await request;
  const staleExit = h.callbacks[0]; request = h.selection.request('schematic'); h.requests[1].resolve(true); await request;
  staleExit(); assert.equal(h.views[0].classList.contains('is-switching-in'), true);
  h.callbacks[1](); assert.equal(h.views[0].classList.contains('active'), true); assert.equal(h.views[1].classList.contains('is-switching-out'), false);
  assert.equal(h.timers.size, 0);
});

test('obsolete failures and completions after leaving cannot replace the current PCB view', async () => {
  const h = selectionHarness(); const older = h.selection.request('layout'), newer = h.selection.request('schematic');
  h.requests[1].resolve(true); await newer; h.requests[0].reject(new Error('offline')); await older;
  assert.equal(h.failures, 0);
  const late = h.selection.request('layout'); h.selection.destroy(); h.requests[2].resolve(true); await late;
  assert.equal(h.reveals, 1); assert.equal(h.buttons[1].getAttribute('aria-busy'), null); assert.equal(h.timers.size, 0);
});

test('reduced-motion PCB changes settle immediately and transfer focus out of a hidden view', async () => {
  const h = selectionHarness(true); h.document.activeElement = h.views[0];
  const request = h.selection.request('layout'); h.requests[0].resolve(true); await request;
  assert.equal(h.buttons[1].focused, true); assert.equal(h.views[0].getAttribute('aria-hidden'), 'true'); assert.equal(h.views[1].inert, false); assert.equal(h.timers.size, 0);
});

test('a current PCB failure can recover through a later request', async () => {
  const h = selectionHarness(); let request = h.selection.request('layout'); h.requests[0].resolve(false); await request;
  assert.equal(h.failures, 1); assert.equal(h.views[0].classList.contains('active'), true);
  request = h.selection.request('schematic'); h.requests[1].resolve(true); await request;
  assert.equal(h.reveals, 1); assert.equal(h.buttons[0].getAttribute('aria-busy'), null);
});

function accessibilityHarness() {
  const observers = [];
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  const embed = new Node('kicanvas-embed'); embed.shadowRoot = new Node('root');
  const hosts = ['zoom_to_page', 'zoom_to_selection', 'download', 'flip'].map(name => {
    const host = new Node('kc-ui-button'); host.setAttribute('name', name); host.shadowRoot = new Node('root'); host.shadowRoot.appendChild(new Node('button')); embed.shadowRoot.appendChild(host); return host;
  });
  const scope = { document: { createElement: tag => new Node(tag) }, MutationObserver: Observer }; load('kicanvas-accessibility.js', scope);
  const cleanup = scope.mountKiCanvasAccessibility(embed);
  return { embed, hosts, observers, cleanup };
}

test('PCB toolbar labels are applied to the actual native buttons inside shadow roots', () => {
  const h = accessibilityHarness(); assert.deepEqual(h.hosts.map(host => host.shadowRoot.querySelector('button').getAttribute('aria-label')), ['Zoom to page', 'Zoom to selected component', 'Download source file', 'Flip board view']);
  assert.equal(h.hosts.every(host => host.shadowRoot.querySelector('style[data-portfolio-controls]')), true);
});

test('a vendor toolbar rerender regains its labels without duplicating styles or observers', () => {
  const h = accessibilityHarness(); const count = h.observers.length; const host = h.hosts[0];
  host.shadowRoot.children[0] = new Node('button'); h.observers[1].callback();
  assert.equal(host.shadowRoot.querySelector('button').getAttribute('aria-label'), 'Zoom to page');
  assert.equal(h.observers.length, count); assert.equal(host.shadowRoot.children.filter(node => node.tagName === 'STYLE').length, 1);
});

test('PCB accessibility observers disconnect on teardown and ignore later vendor mutations', () => {
  const h = accessibilityHarness(); h.cleanup(); assert.equal(h.observers.every(observer => observer.disconnected), true);
  const replacement = new Node('button'); h.hosts[0].shadowRoot.children[0] = replacement; h.observers[0].callback(); assert.equal(replacement.getAttribute('aria-label'), null);
});

function demoHarness() {
  const figure = new Node('figure'); figure.dataset.demo = 'companion'; const frame = new Node(); frame.className = 'hardware-demo-frame'; const caption = new Node('figcaption'); caption.id = 'hint'; caption.innerHTML = 'Original controls'; figure.append(frame, caption);
  const document = new EventTarget(); document.hidden = false; document.createElement = tag => new Node(tag);
  const window = new EventTarget(); window.innerHeight = 844;
  const observers = [];
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  window.IntersectionObserver = Observer;
  const scope = { applyDemoHint() {}, document, window, IntersectionObserver: Observer, console: { error() {} } }; load('demos/mount.js', scope);
  const gate = deferred(); let mounts = 0, destroys = 0, resumes = 0, pauses = 0;
  const mod = { mount() { mounts++; return { destroy() { destroys++; }, resume() { resumes++; }, pause() { pauses++; } }; } };
  const cleanup = scope.mountDemo(figure, { loader: () => gate.promise });
  return { scope, figure, frame, document, observers, gate, mod, cleanup, get mounts() { return mounts; }, get destroys() { return destroys; }, get resumes() { return resumes; }, get pauses() { return pauses; } };
}

test('navigating away during a lazy demo import never mounts a detached simulation', async () => {
  const h = demoHarness(); h.document.dispatchEvent(new Event('astro:before-preparation')); h.gate.resolve(h.mod); await flush();
  assert.equal(h.mounts, 0); assert.equal(h.observers.length, 0);
});

test('a detached demo cannot install new lifecycle observers after its import resolves', async () => {
  const h = demoHarness(); h.figure.isConnected = false; h.gate.resolve(h.mod); await flush(); assert.equal(h.mounts, 0); assert.equal(h.observers.length, 0); h.cleanup();
});

test('hidden-page intersection updates cannot resume a demo, and cleanup destroys exactly once', async () => {
  const h = demoHarness(); h.gate.resolve(h.mod); await flush(); const resumed = h.resumes;
  h.document.hidden = true; h.observers[0].callback([{ isIntersecting: true }]); assert.equal(h.resumes, resumed); assert.equal(h.pauses, 1);
  h.cleanup(); h.cleanup(); assert.equal(h.destroys, 1); assert.equal(h.observers[0].disconnected, true);
});

test('duplicate demo mounts reuse their teardown rather than starting another simulation', async () => {
  const h = demoHarness(); const again = h.scope.mountDemo(h.figure, { loader: () => { throw new Error('duplicate loader'); } });
  assert.equal(again, h.cleanup); h.gate.resolve(h.mod); await flush(); assert.equal(h.mounts, 1); h.cleanup();
});

function fire(node, type, props) { const event = new Event(type); Object.assign(event, props); node.dispatchEvent(event); }
function gestureHarness() {
  const target = new Node(); const events = []; const scope = { AbortController, performance: { now: () => 20 }, GESTURE_NONE: 0, GESTURE_SLIDE_UP: 1, GESTURE_SLIDE_DOWN: 2 }; load('demos/companion/gesture.js', scope);
  const gesture = scope.createGestureTracker(target, { onStart: () => true, onDrag: delta => events.push(['drag', delta]), onRelease: delta => events.push(['release', delta]), onCancel: () => events.push(['cancel']) });
  const pointer = (type, id, x, extra = {}) => fire(target, type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: 0, ...extra });
  return { target, events, gesture, pointer };
}

test('a second finger cannot steal an active Kirby swipe', () => {
  const h = gestureHarness(); h.pointer('pointerdown', 1, 10); h.pointer('pointerdown', 2, 100, { isPrimary: false }); h.pointer('pointermove', 1, 60); h.pointer('pointerup', 1, 60);
  assert.deepEqual(h.events, [['drag', 50], ['release', 50]]);
});

test('lost pointer capture cancels a Kirby swipe once and later release cannot commit it', () => {
  const h = gestureHarness(); h.pointer('pointerdown', 1, 10); h.pointer('pointermove', 1, 60); h.pointer('lostpointercapture', 1, 60); h.pointer('pointerup', 1, 60);
  assert.deepEqual(h.events, [['drag', 50], ['cancel']]);
});

test('leaving Kirby removes gesture listeners and prevents later pointer input', () => {
  const h = gestureHarness(); h.gesture.destroy(); h.pointer('pointerdown', 1, 10); h.pointer('pointermove', 1, 60); h.pointer('pointerup', 1, 60); assert.deepEqual(h.events, []);
});

test('invalid scheduler edits retain the last valid value; valid edits are snapped and bounded', () => {
  const scope = { document: { createElement: tag => new Node(tag), createTextNode: text => ({ textContent: text }) } }; load('demos/vehicle-rtos/controls.js', scope);
  const commits = []; const controls = scope.createControls([{ id: 'pid', name: 'PID', c: 60, t: 100 }], { onChange: (...values) => commits.push(values) });
  const inputs = controls.el.querySelectorAll('*').filter(node => node.tagName === 'INPUT');
  for (const invalid of ['not a number', '', 'Infinity']) { inputs[0].value = invalid; inputs[0].dispatchEvent(new Event('change')); assert.equal(inputs[0].value, '60'); }
  assert.equal(commits.length, 0); inputs[0].value = '72'; inputs[0].dispatchEvent(new Event('change')); assert.equal(inputs[0].value, '70');
  inputs[1].value = '4000'; inputs[1].dispatchEvent(new Event('change')); assert.equal(inputs[1].value, '2000'); assert.equal(commits.length, 2);
});

function kiCanvasHarness() {
  const timers = new Map(), frames = new Map(); let next = 0;
  const window = new EventTarget(); const customElements = { get: () => null }; window.customElements = customElements;
  window.setTimeout = fn => { timers.set(++next, fn); return next; }; window.clearTimeout = id => timers.delete(id);
  const document = new EventTarget(); document.head = new Node('head'); document.createElement = tag => new Node(tag);
  class Observer { observe() {} disconnect() {} }
  const scope = { window, document, customElements, MutationObserver: Observer, performance: { now: () => 1 }, requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, setTimeout: window.setTimeout, cancelAnimationFrame: id => frames.delete(id) };
  load('kicanvas-config.js', scope);
  return { scope, document, window, timers, frames, customElements };
}

test('a schematic does not start a 30-second poll for a board viewer that cannot exist', () => {
  const h = kiCanvasHarness(); const embed = new Node('kicanvas-embed'); embed.shadowRoot = new Node('root'); embed.hasAttribute = key => embed.attrs.has(key);
  let boards = 0, schematics = 0, configured = 0;
  h.scope.applyEmbedTheme = () => true; h.scope.getBoardViewer = () => { boards++; return null; }; h.scope.getSchematicViewer = () => { schematics++; return { loaded: true }; }; h.scope.configureSchematicViewer = () => { configured++; };
  h.scope.initKiCanvasEmbeds([embed]);
  assert.equal(boards, 0); assert.equal(schematics, 1); assert.equal(configured, 1); assert.equal(h.frames.size, 0);
});

test('a detached CAD embed stops its readiness poll at the next scheduled frame', () => {
  const h = kiCanvasHarness(); const embed = new Node('kicanvas-embed'); let completed = 0;
  h.scope.whenViewerReady(embed, () => null, () => { completed++; }); assert.equal(h.frames.size, 1);
  embed.isConnected = false; const frame = [...h.frames.values()][0]; h.frames.clear(); frame();
  assert.equal(h.frames.size, 0); assert.equal(completed, 0);
});

test('a stalled CAD module times out, removes its failed script, and can retry successfully', async () => {
  const h = kiCanvasHarness(); const first = h.scope.loadKiCanvasScript(); const failure = assert.rejects(first, /failed to load/);
  const originalUrl = h.document.head.children[0].src;
  [...h.timers.values()][0](); await failure; assert.equal(h.window.__kicanvasPromise, null); assert.equal(h.document.head.children.length, 0);
  const second = h.scope.loadKiCanvasScript(); assert.notEqual(h.document.head.children[0].src, originalUrl); h.document.head.children[0].onload(); await second; assert.equal(h.timers.size, 0);
});

test('opening and immediately closing the phone menu cannot leave a ghost keyboard trap', () => {
  const source = readFileSync(new URL('../src/scripts/portfolio-core.js', import.meta.url), 'utf8');
  const frames = new Map(), timers = new Map(); let next = 0;
  const navLinks = new Node(), navToggle = new Node('button');
  const scope = { navLinks, navToggle, mobileNavQuery: { matches: true, addEventListener() {} }, prefersReducedMotion: () => false, document: { activeElement: null, querySelectorAll: () => [] }, window: { clearTimeout: id => timers.delete(id), setTimeout: fn => { timers.set(++next, fn); return next; } }, requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id) };
  runInNewContext(source.slice(source.indexOf('let mobileMenuCloseTimer'), source.indexOf('const initializedNavToggles')), scope);
  scope.setMobileMenuState(true); scope.setMobileMenuState(false);
  assert.equal(frames.size, 0); assert.equal(navLinks.hidden, true); assert.equal(navLinks.inert, true); assert.equal(navLinks.classList.contains('open'), false); assert.equal(navToggle.getAttribute('aria-expanded'), 'false');
  scope.setMobileMenuState(true); const frame = [...frames.values()][0]; frames.clear(); frame();
  assert.equal(navLinks.hidden, false); assert.equal(navLinks.inert, false); assert.equal(navToggle.getAttribute('aria-expanded'), 'true'); assert.equal(navLinks.classList.contains('open'), true);
});

function themeHarness() {
  const source = readFileSync(new URL('../src/scripts/portfolio-core.js', import.meta.url), 'utf8'); const storage = new Map(); let failWrite = false;
  const scope = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, val) => { if (failWrite) throw new Error('private storage'); storage.set(key, val); } }, darkThemeQuery: { matches: true }, document: { documentElement: { dataset: {} } } };
  runInNewContext(source.slice(source.indexOf('let sessionTheme'), source.indexOf('const DEFAULT_THEME_COLORS')), scope);
  return { scope, storage, blockWrite() { failWrite = true; } };
}

test('system dark mode survives a page swap that has no theme attribute', () => {
  const h = themeHarness(); assert.equal(h.scope.resolveTheme(), 'dark'); h.scope.document.documentElement.dataset.theme = 'light'; assert.equal(h.scope.resolveTheme(), 'dark');
  h.scope.darkThemeQuery.matches = false; assert.equal(h.scope.resolveTheme(), 'light'); h.storage.set('portfolio-theme', 'invalid'); h.scope.darkThemeQuery.matches = true; assert.equal(h.scope.resolveTheme(), 'dark');
});

test('an explicit theme choice survives navigation even if browser storage cannot be written', () => {
  const h = themeHarness(); h.storage.set('portfolio-theme', 'light'); assert.equal(h.scope.resolveTheme(), 'light');
  h.blockWrite(); h.scope.writeStoredTheme('dark'); assert.equal(h.scope.resolveTheme(), 'dark'); h.scope.document.documentElement.dataset.theme = 'light'; assert.equal(h.scope.resolveTheme(), 'dark');
});
