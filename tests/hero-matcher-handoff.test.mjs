import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/scripts/project-journey.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('function containedMatcherRect'), source.indexOf('function journeyFilmExtension'));
class Node extends EventTarget {
  children = []; dataset = {}; complete = true; naturalWidth = 1920;
  style = {}; hidden = false;
  tokens = new Set();
  classList = { add: n => this.tokens.add(n), remove: n => this.tokens.delete(n), contains: n => this.tokens.has(n) };
  append(node) { this.children.push(node); node.parent = this; }
  remove() { this.parent.children = this.parent.children.filter(n => n !== this); }
  setAttribute(key, value) { this[key] = value; }
}
function setup() {
  const window = { scrollY: 0 };
  const document = { body: new Node(), hidden: false, createElement: () => new Node() };
  const root = new Node(), hero = new Node(), image = new Node(), target = new Node(), exhibit = new Node();
  let width = 1440;
  image.currentSrc = '/assets/workshop/hardware-portrait.webp';
  image.getBoundingClientRect = () => ({ left: width * .27, top: 227 - window.scrollY, width: width * .73, height: 683 });
  target.getBoundingClientRect = () => ({ left: width * .39, top: Math.max(57, 1000 - window.scrollY) + 32, width: width * .57, height: 760 });
  exhibit.dataset.mode = 'machine';
  hero.querySelector = () => image;
  root.querySelector = selector => selector === '[data-matcher-render]' ? target : exhibit;
  document.querySelector = () => hero;
  const track = { getBoundingClientRect: () => ({ top: 1000 - window.scrollY }) };
  const stage = { getBoundingClientRect: () => ({ top: Math.max(57, 1000 - window.scrollY) }) };
  let paints = 0;
  const scope = { document, window, getComputedStyle: () => ({ top: '57px' }), clamp: n => Math.max(0, Math.min(1, n)), AbortController };
  runInNewContext(code, scope);
  const controller = new AbortController();
  const handoff = scope.createHeroMatcherHandoff({ root, track, stage, signal: controller.signal, requestPaint: () => paints++ });
  const layer = document.body.children[0];
  return { scope, window, document, root, hero, image, exhibit, layer, handoff, paints: () => paints, resize: n => { width = n; }, dispose: () => { controller.abort(); handoff.destroy(); } };
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
