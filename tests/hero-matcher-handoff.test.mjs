import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/scripts/project-journey.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('function containedMatcherRect'), source.indexOf('function journeyFilmExtension'));
class Node extends EventTarget {
  children = []; dataset = {}; complete = true; naturalWidth = 1920;
  style = { removeProperty(name) { delete this[name]; } }; hidden = false;
  tokens = new Set();
  classList = { add: n => this.tokens.add(n), remove: n => this.tokens.delete(n), contains: n => this.tokens.has(n) };
  append(node) { this.children.push(node); node.parent = this; }
  remove() { this.parent.children = this.parent.children.filter(n => n !== this); }
  setAttribute(key, value) { this[key] = value; }
}
function setup({ nativeFlow = false } = {}) {
  const window = { scrollY: 0, innerHeight: 844 };
  const document = new EventTarget();
  Object.assign(document, { body: new Node(), hidden: false, createElement: () => new Node() });
  const root = new Node(), hero = new Node(), image = new Node(), target = new Node(), exhibit = new Node();
  let width = nativeFlow ? 390 : 1440;
  image.currentSrc = `/assets/workshop/hardware-portrait${nativeFlow ? '-mobile' : ''}.webp`;
  image.getBoundingClientRect = () => nativeFlow
    ? { left: 0, top: 500 - window.scrollY, width, height: width / 1.3 }
    : { left: width * .27, top: 227 - window.scrollY, width: width * .73, height: 683 };
  target.getBoundingClientRect = () => nativeFlow
    ? { left: 24, top: 840 - window.scrollY, width: width - 48, height: (width - 48) / 1.12 }
    : { left: width * .39, top: Math.max(57, 1000 - window.scrollY) + 32, width: width * .57, height: 760 };
  exhibit.dataset.mode = 'machine';
  exhibit.querySelector = () => null;
  hero.querySelector = () => image;
  root.querySelector = selector => ({ '[data-matcher-model]': target, '[data-matcher-render]': target, '[data-matcher-exhibit]': exhibit })[selector] ?? null;
  document.querySelector = () => hero;
  const track = { getBoundingClientRect: () => ({ top: 1000 - window.scrollY }) };
  const stage = { getBoundingClientRect: () => ({ top: Math.max(57, 1000 - window.scrollY) }) };
  let paints = 0;
  const scope = { document, window, getComputedStyle: () => ({ top: '57px', getPropertyValue: () => '52px' }), clamp: n => Math.max(0, Math.min(1, n)), AbortController, CustomEvent };
  runInNewContext(code, scope);
  const controller = new AbortController();
  const handoff = nativeFlow ? scope.createNativeHeroFlow({ root, signal: controller.signal, requestPaint: () => paints++ }) : scope.createHeroMatcherHandoff({ root, track, stage, signal: controller.signal, requestPaint: () => paints++ });
  const layer = document.body.children[0];
  return { scope, window, document, root, hero, image, target, exhibit, layer, handoff, paints: () => paints, resize: n => { width = n; }, dispose: () => { controller.abort(); handoff.destroy(); } };
}

test('containment preserves the complete image and the handoff reaches exact endpoints', () => {
  const h = setup();
  const from = h.scope.containedMatcherRect({ left: 3, top: 2, width: 500, height: 300 });
  assert.deepEqual(JSON.parse(JSON.stringify(from)), { left: 53, top: 2, width: 400, height: 300 });
  const to = { left: 100, top: 80, width: 800, height: 600 };
  assert.deepEqual(JSON.parse(JSON.stringify(h.scope.heroMatcherPose(from, to, -1))), JSON.parse(JSON.stringify(from)));
  assert.deepEqual(JSON.parse(JSON.stringify(h.scope.heroMatcherPose(from, to, 2))), to);
  h.dispose();
});
test('forward, reverse and fast scrolling use the current coordinate without queued transitions', () => {
  const h = setup();
  h.handoff.paint(); assert.equal(h.layer.hidden, true);
  h.window.scrollY = 470; h.handoff.paint();
  const halfway = h.layer.style.transform;
  assert.equal(h.layer.hidden, false);
  assert.equal(h.hero.tokens.has('is-handoff-source'), true);
  assert.equal(h.root.tokens.has('is-hero-handoff'), true);
  assert.equal(h.layer.style.opacity, undefined);
  h.window.scrollY = 1800; h.handoff.paint();
  assert.equal(h.layer.hidden, true);
  assert.equal(h.root.tokens.has('is-hero-handoff'), false);
  h.window.scrollY = 470; h.handoff.paint(); assert.equal(h.layer.style.transform, halfway);
  h.window.scrollY = 0; h.handoff.paint();
  assert.equal(h.hero.tokens.has('is-handoff-source'), false);
  h.dispose();
});
test('failed or undecoded handoff media leaves both original surfaces available', () => {
  const h = setup(); h.window.scrollY = 470;
  h.layer.children[0].naturalWidth = 0; h.handoff.paint();
  assert.equal(h.layer.hidden, true); assert.equal(h.hero.tokens.size, 0); assert.equal(h.root.tokens.size, 0);
  h.layer.children[0].naturalWidth = 1920; h.image.complete = false; h.handoff.paint();
  assert.equal(h.layer.hidden, true);
  h.image.complete = true; h.layer.children[0].dispatchEvent(new Event('load'));
  assert.equal(h.paints(), 1); h.handoff.paint(); assert.equal(h.layer.hidden, false);
  h.dispose();
});
test('explicit mode selection interrupts the handoff and returns control to the real exhibit', () => {
  const h = setup(); h.window.scrollY = 470; h.handoff.paint();
  h.exhibit.dataset.mode = 'inside'; h.handoff.paint();
  assert.equal(h.layer.hidden, true); assert.equal(h.root.tokens.size, 0);
  h.exhibit.dataset.mode = 'machine'; h.handoff.paint(); assert.equal(h.layer.hidden, false);
  h.dispose();
});
test('resize remeasures registration and hidden-page/reset states release the temporary layer', () => {
  const h = setup(); h.window.scrollY = 470; h.handoff.paint();
  const old = h.layer.style.transform; h.resize(1200); h.handoff.paint();
  assert.notEqual(h.layer.style.transform, old);
  h.document.hidden = true; h.handoff.paint();
  assert.equal(h.layer.hidden, true); assert.equal(h.layer.style.willChange, '');
  h.document.hidden = false; h.handoff.paint(); assert.equal(h.layer.hidden, false);
  h.handoff.reset(); assert.equal(h.layer.hidden, true);
  h.dispose();
});
test('navigation teardown removes the layer and aborts late image readiness', () => {
  const h = setup(); h.window.scrollY = 470; h.handoff.paint(); h.dispose();
  assert.equal(h.document.body.children.length, 0);
  assert.equal(h.hero.tokens.size, 0); assert.equal(h.root.tokens.size, 0);
  h.layer.children[0].dispatchEvent(new Event('load')); h.handoff.paint();
  assert.equal(h.paints(), 0); assert.equal(h.layer.hidden, true);
});

test('phone flow changes the existing model without creating or hiding any surfaces', () => {
  const h = setup({ nativeFlow: true }), events = [];
  h.document.addEventListener('portfolio:hero-matcher-progress', event => events.push(event.detail));
  h.handoff.paint();
  assert.equal(h.document.body.children.length, 0);
  assert.equal(h.root.tokens.size, 0);
  assert.equal(h.hero.tokens.size, 0);
  assert.equal(events.at(-1).nativeFlow, true);
  assert.equal(events.at(-1).seatStart, 840 - 844 * .75);
  h.window.scrollY = 700; h.handoff.paint();
  assert.equal(events.at(-1).distance, 700 - (840 - 844 * .75));
  h.window.scrollY = 460; h.handoff.paint();
  assert.equal(events.at(-1).scrollingUp, true);
  assert.equal(events.at(-1).previousScroll, 700);
  h.window.innerHeight = 667; h.handoff.paint();
  assert.equal(events.at(-1).seatStart, 840 - 667 * .75);
  h.dispose();
  assert.equal(events.at(-1).inactive, true);
});
test('phone readiness repaints the current position without another scroll and aborts on teardown',()=>{
  const h=setup({nativeFlow:true});
  h.document.dispatchEvent(new CustomEvent('portfolio:matcher-render-ready'));
  assert.equal(h.paints(),1);h.dispose();
  h.document.dispatchEvent(new CustomEvent('portfolio:matcher-render-ready'));assert.equal(h.paints(),1);
});
test('an opening-viewport phone model starts at rest and reaches full travel while its entire aperture is visible',()=>{
  const h=setup({nativeFlow:true}),events=[];
  h.target.getBoundingClientRect=()=>({top:466-h.window.scrollY,height:300});
  h.document.addEventListener('portfolio:hero-matcher-progress',event=>events.push(event.detail));
  h.handoff.paint();assert.equal(events.at(-1).seatStart,0);assert.equal(events.at(-1).distance,0);
  h.window.scrollY=185;h.handoff.paint();assert.equal(events.at(-1).distance,185);
  h.window.scrollY=h.window.innerHeight*.35;h.handoff.paint();
  const rect=h.target.getBoundingClientRect();assert.ok(rect.top>52&&rect.top+rect.height<h.window.innerHeight);
  h.dispose();
});

test('phone flow freezes for hidden pages and paused motion, then cleans up late work', () => {
  const h = setup({ nativeFlow: true }), events = [];
  h.document.addEventListener('portfolio:hero-matcher-progress', event => events.push(event.detail));
  h.handoff.paint();
  h.document.hidden = true; h.window.scrollY = 700; h.handoff.paint();
  assert.equal(events.length, 1);
  h.document.hidden = false; h.root.dataset.motionPaused = 'true'; h.handoff.paint();
  assert.equal(events.length, 1);
  h.root.dataset.motionPaused = 'false'; h.handoff.reset(); h.handoff.paint();
  assert.equal(events.at(-1).scrollingUp, false);
  h.dispose(); h.handoff.paint();
  assert.equal(events.length, 3);
});
