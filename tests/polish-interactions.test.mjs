import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

class Node extends EventTarget {
  constructor(tag = 'div', name = '') {
    super(); this.tag = tag; this.className = name; this.children = []; this.attrs = new Map();
    const classes = new Set();
    this.classList = { add: (...names) => names.forEach(x => classes.add(x)), contains: x => classes.has(x) };
    this.style = { setProperty() {} };
  }
  setAttribute(name, value) { this.attrs.set(name, value); }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children.flatMap(x => x.tag === 'fragment' ? x.children : [x]); }
  querySelector() { return this.children[0]; }
  querySelectorAll(selector) { return this.children.flatMap(x => [x, ...x.querySelectorAll(selector)]).filter(x => x.className === selector.slice(1)); }
  getContext() { return {}; }
  setPointerCapture() {}
}

function stepperHarness() {
  const timers = new Map(); let next = 0;
  const parent = new Node(); const state = { value: 7, min: 1, max: 12 };
  const scope = {
    el: (tag, name) => new Node(tag, name), spr: () => new Node('img'),
    playUiChange() {}, DIGIT_W: 36, PHOS_INK: '#000', PHOS_GOLD: '#ffe566', asset: x => x,
    window: { setTimeout: fn => { timers.set(++next, fn); return next; }, setInterval: fn => { timers.set(++next, fn); return next; } },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
  };
  const source = readFileSync(new URL('../src/scripts/demos/companion/stepper.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export function', 'function');
  runInNewContext(source, scope);
  scope.createStepper(parent, 0, 26, state, 'Alarm hours');
  const buttons = parent.querySelectorAll('.kirby-stepper-btn');
  const fire = (node, type, props = {}) => { const event = new Event(type); Object.assign(event, { stopPropagation() {}, ...props }); node.dispatchEvent(event); };
  return { scope, parent, state, buttons, timers, fire };
}

test('alarm steppers respond to keyboard activation and identify their unit and value', () => {
  const h = stepperHarness();
  h.fire(h.buttons[0], 'click', { detail: 0 });
  assert.equal(h.state.value, 8);
  assert.equal(h.buttons[0].attrs.get('aria-label'), 'Increase alarm hours');
  assert.equal(h.parent.children[0].attrs.get('aria-label'), 'Alarm hours: 8');
  h.fire(h.buttons[1], 'click', { detail: 0 });
  assert.equal(h.state.value, 7);
});

test('pointer activation steps once; cancellation stops held repeats; secondary clicks do nothing', () => {
  const h = stepperHarness();
  h.fire(h.buttons[0], 'pointerdown', { button: 0, pointerId: 1 });
  h.fire(h.buttons[0], 'click', { detail: 1 });
  assert.equal(h.state.value, 8);
  [...h.timers.values()][0]();
  h.fire(h.buttons[0], 'pointercancel');
  assert.equal(h.timers.size, 0);
  h.fire(h.buttons[0], 'pointerdown', { button: 2, pointerId: 1 });
  assert.equal(h.state.value, 8);
});

test('leaving a demo clears every held stepper and preserves wraparound', () => {
  const h = stepperHarness(); h.state.value = 12;
  h.fire(h.buttons[0], 'pointerdown', { button: 0, pointerId: 1 });
  assert.equal(h.state.value, 1);
  h.scope.cancelStepperHolds(h.parent);
  assert.equal(h.timers.size, 0);
});

function resumeHarness({ delayedLibrary = false } = {}) {
  const viewer = new Node(); viewer.dataset = { resumePdf: '/resume.pdf' }; viewer.clientWidth = 500; viewer.hidden = false;
  const original = new Node('p'); viewer.appendChild(original);
  const fallback = { hidden: true };
  const note = {};
  const summary = new Node(); summary.hidden = true; summary.querySelector = () => note;
  const libraryGate = deferred(); const tasks = []; const observers = []; const timers = new Map();
  let destroyed = 0, loaded = 0;
  const pdf = { numPages: 1, async getPage() { return {
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
    render() { const gate = deferred(); const task = { ...gate, cancel() { const error = new Error('cancelled'); error.name = 'RenderingCancelledException'; gate.reject(error); } }; tasks.push(task); return task; },
  }; } };
  const library = { getDocument() { loaded++; return { promise: Promise.resolve(pdf), destroy() { destroyed++; return Promise.resolve(); } }; } };
  class Observer { constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  const document = new EventTarget(); document.createElement = tag => new Node(tag); document.createDocumentFragment = () => new Node('fragment');
  const scope = { document, console: { error() {} }, ResizeObserver: Observer,
    window: { ResizeObserver: Observer, devicePixelRatio: 1, getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', borderLeftWidth: '0', borderRightWidth: '0' }), clearTimeout: id => timers.delete(id), setTimeout: fn => { timers.set(1, fn); return 1; } },
  };
  const source = readFileSync(new URL('../src/scripts/resume-viewer.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export function', 'function');
  runInNewContext(source, scope);
  const cleanup = scope.mountResumeViewer(viewer, { fallback, summary, loadLibrary: () => delayedLibrary ? libraryGate.promise : Promise.resolve(library) });
  const resize = width => { viewer.clientWidth = width; observers.at(-1).callback(); const fn = timers.get(1); timers.clear(); fn(); };
  return { viewer, original, fallback, summary, note, tasks, observers, libraryGate, library, cleanup, resize, get loaded() { return loaded; }, get destroyed() { return destroyed; } };
}

test('leaving before the PDF library loads never creates a document or late observer', async () => {
  const h = resumeHarness({ delayedLibrary: true }); h.cleanup(); h.libraryGate.resolve(h.library); await flush();
  assert.equal(h.loaded, 0); assert.equal(h.observers.length, 0);
  assert.equal(h.viewer.children[0], h.original); assert.equal(h.fallback.hidden, true);
});

test('resume resizing holds the complete page until its replacement finishes and ignores interrupted renders', async () => {
  const h = resumeHarness(); await flush(); h.tasks[0].resolve(); await flush();
  assert.equal(h.summary.hidden, true);
  const oldPage = h.viewer.children[0];
  h.resize(600); await flush();
  assert.equal(h.viewer.children[0], oldPage);
  h.resize(700); await flush();
  assert.equal(h.viewer.children[0], oldPage); assert.equal(h.fallback.hidden, true);
  h.tasks[2].resolve(); await flush();
  assert.notEqual(h.viewer.children[0], oldPage); assert.equal(h.viewer.attrs.get('aria-busy'), 'false');
  h.cleanup(); assert.equal(h.destroyed, 1); assert.equal(h.observers[0].disconnected, true);
});

test('a real rendering failure reveals readable highlights and PDF recovery actions', async () => {
  const h = resumeHarness(); await flush(); h.tasks[0].reject(new Error('render failed')); await flush();
  assert.equal(h.viewer.hidden, true); assert.equal(h.fallback.hidden, false); assert.equal(h.summary.hidden, false);
  assert.equal(h.summary.classList.contains('is-visible'), true);
  assert.match(h.note.textContent, /open or download/); h.cleanup();
});

test('returning to the displayed resume width cancels a stale replacement without rendering again', async () => {
  const h = resumeHarness(); await flush(); h.tasks[0].resolve(); await flush();
  const page = h.viewer.children[0];
  h.resize(500); await flush(); assert.equal(h.tasks.length, 1);
  h.resize(600); await flush(); assert.equal(h.tasks.length, 2);
  h.resize(500); await flush();
  h.tasks[1].resolve(); await flush();
  assert.equal(h.tasks.length, 2); assert.equal(h.viewer.children[0], page);
  assert.equal(h.viewer.attrs.get('aria-busy'), 'false'); assert.equal(h.fallback.hidden, true);
  h.cleanup();
});

// A cancelled close must never launch a stale search selection.
test('search selection is cancelled by navigation or reopening the dialog', async () => {
  const core = readFileSync(new URL('../src/scripts/portfolio-core.js', import.meta.url), 'utf8');
  const activate = core.slice(core.indexOf('  async function activate(cmd)'), core.indexOf('  const stopBackgroundScroll'));
  for (const [aborted, reopened, expected] of [[true, false, 0], [false, true, 0], [false, false, 1]]) {
    const gate = deferred(); let calls = 0;
    const scope = { closePalette: () => gate.promise, signal: { aborted }, isOpen: () => reopened };
    runInNewContext(activate, scope);
    const pending = scope.activate({ run: () => calls++ }); gate.resolve(); await pending;
    assert.equal(calls, expected);
  }
});

test('embedded phone tuning lets touch scroll the page while mouse dragging and desktop touch remain available', () => {
  const source=readFileSync(new URL('../src/scripts/instrument.js',import.meta.url),'utf8');
  const pointerCode=source.slice(source.indexOf('  const phoneInput ='),source.indexOf('  bindPointer(renderer.el);',source.indexOf('  const phoneInput =')));
  const phone=new EventTarget(); phone.matches=true;
  const controller=new AbortController(),el=new EventTarget(); el.style={touchAction:'none'};
  let changed=0,captured=0;
  el.setPointerCapture=()=>captured++;
  const scope={window:{matchMedia:()=>phone},root:{closest:()=>({})},renderer:{pointerToDeg:()=>[24,80]},
    signal:controller.signal,stopAuto(){},trail:[],setPositions(){changed++;},syncInputs(){},refresh(){},
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},announce(){},currentVSWR:()=>1.2};
  runInNewContext(pointerCode,scope); scope.bindPointer(el);
  const fire=pointerType=>{const event=new Event('pointerdown');Object.assign(event,{pointerType,pointerId:1});el.dispatchEvent(event);};
  assert.equal(el.style.touchAction,'pan-y pinch-zoom');
  fire('touch'); assert.equal(changed,0); assert.equal(captured,0);
  fire('mouse'); assert.equal(changed,1); assert.equal(captured,1);
  phone.matches=false; phone.dispatchEvent(new Event('change'));
  assert.equal(el.style.touchAction,'none');
  fire('touch'); assert.equal(changed,2);
  controller.abort(); fire('touch'); assert.equal(changed,2);
});
