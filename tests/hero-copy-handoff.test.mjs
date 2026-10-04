import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/scripts/project-journey.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('function createHeroCopyHandoff'), source.indexOf('\nfunction journeyFilmExtension'));
function setup() {
  const animations = [], window = { scrollY: 0, innerWidth: 1440, innerHeight: 1000 };
  const node = (top, width = 400) => {
    const tokens = new Set();
    const element = {
      inert: false, style: { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } },
      classList: { add: name => tokens.add(name), remove: name => tokens.delete(name), contains: name => tokens.has(name) },
      tokens, getBoundingClientRect: () => ({ top: top - window.scrollY, left: 52, width: width === 'title' ? window.innerWidth - 104 : width }),
      animate(frames, timing) {
        let resolve, reject;
        const animation = { node: element, frames, timing, cancelled: false,
          finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
          finish() { resolve(); }, cancel() { this.cancelled = true; reject(new Error('Cancelled')); } };
        animations.push(animation); return animation;
      }
    };
    return element;
  };
  const title = node(113, 'title'), intro = node(730), foot = node(935), panel = node(1092), evidence = node(1528);
  const copy = { inert: false, querySelectorAll: () => [title, intro] };
  const hero = node(57), root = node(1000);
  hero.querySelector = selector => selector === '.workshop-hero-copy' ? copy : foot;
  root.querySelector = selector => selector === '.matcher-panel' ? panel : evidence;
  const document = { hidden: false, querySelector: () => hero };
  const stage = { getBoundingClientRect: () => ({ top: Math.max(57, 1000 - window.scrollY) }) };
  const track = { getBoundingClientRect: () => ({ top: 1000 - window.scrollY }) };
  const scope = { document, window, getComputedStyle: e => e === stage ? { top: '57px' } : { opacity: e.displayOpacity ?? e.style.opacity ?? '1' }, clamp: n => Math.max(0, Math.min(1, n)) };
  runInNewContext(code, scope);
  const handoff = scope.createHeroCopyHandoff({ root, track, stage });
  return { window, document, hero, root, copy, title, intro, foot, panel, evidence, animations, handoff, all: [title, intro, foot, panel, evidence] };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('the opening remains at its original coordinates and hidden incoming controls are inert', () => {
  const h = setup(); h.handoff.paint();
  assert.equal(h.title.style['--hero-copy-top'], '113px');
  assert.equal(h.intro.style['--hero-copy-top'], '730px');
  assert.equal(h.root.style['--hero-copy-shift'], '-943px');
  assert.equal(h.title.style.opacity, '1'); assert.equal(h.panel.style.opacity, '0');
  assert.equal(h.copy.inert, false); assert.equal(h.panel.inert, true);
  h.window.scrollY = 100; h.handoff.paint();
  assert.equal(h.title.style['--hero-copy-top'], '113px');
  assert.equal(h.root.style['--hero-copy-shift'], '-843px');
  assert.equal(h.animations.length, 0);
});

test('crossing the threshold makes one brief fade that settles when scrolling stops', async () => {
  const h = setup(); h.handoff.paint(); h.window.scrollY = 350; h.handoff.paint();
  assert.equal(h.animations.length, 5);
  assert.equal(h.animations[0].timing.duration, 110);
  assert.equal(h.animations.at(-1).timing.duration, 180);
  assert.equal(h.animations.at(-1).timing.delay, 110);
  assert.equal(h.copy.inert, true); assert.equal(h.panel.inert, false);
  h.handoff.paint(); assert.equal(h.animations.length, 5, 'continued scroll does not queue fades');
  h.animations.forEach(animation => animation.finish()); await flush();
  assert.equal(h.title.style.opacity, '0'); assert.equal(h.panel.style.opacity, '1');
});

test('reverse input cancels outgoing fades and starts from their displayed opacity', async () => {
  const h = setup(); h.handoff.paint(); h.window.scrollY = 350; h.handoff.paint();
  const first = [...h.animations]; h.title.displayOpacity = '.4'; h.panel.displayOpacity = '.6';
  h.window.scrollY = 150; h.handoff.paint();
  assert.ok(first.every(animation => animation.cancelled));
  const reversal = h.animations.slice(5);
  assert.equal(reversal.find(a => a.node === h.title).frames[0].opacity, .4);
  assert.equal(reversal.find(a => a.node === h.panel).frames[0].opacity, .6);
  assert.equal(h.copy.inert, false); assert.equal(h.panel.inert, true);
  first.forEach(animation => animation.finish()); await flush();
  assert.equal(h.title.style.opacity, '.4', 'stale completion cannot change the reversal');
  reversal.forEach(animation => animation.finish()); await flush();
  assert.equal(h.title.style.opacity, '1'); assert.equal(h.panel.style.opacity, '0');
});

test('fast skips and resizing release native flow and remeasure the original hero', async () => {
  const h = setup(); h.handoff.paint(); h.window.scrollY = 350; h.handoff.paint();
  h.window.innerWidth = 1200; h.handoff.paint();
  assert.equal(h.title.style['--hero-copy-width'], '1096px');
  assert.equal(h.title.style['--hero-copy-top'], '113px');
  h.window.scrollY = 1800; h.handoff.paint();
  h.animations.forEach(animation => animation.finish()); await flush();
  assert.ok(h.all.every(node => !node.inert && node.style.opacity === ''));
  assert.ok(!h.root.tokens.has('is-copy-handoff'));
  h.window.scrollY = 0; h.handoff.paint();
  assert.equal(h.title.style.opacity, '1'); assert.equal(h.panel.style.opacity, '0');
});

test('hidden documents and navigation leave no pinned or hidden content', async () => {
  const h = setup(); h.handoff.paint(); h.window.scrollY = 350; h.handoff.paint();
  h.document.hidden = true; h.handoff.paint();
  assert.ok(!h.hero.tokens.has('is-copy-handoff'));
  assert.ok(h.all.every(node => node.style.opacity === '' && !node.inert));
  h.document.hidden = false; h.handoff.paint(); h.handoff.destroy();
  h.animations.forEach(animation => animation.finish()); await flush(); h.handoff.paint();
  assert.ok(h.all.every(node => node.style.opacity === '' && !node.inert));
  assert.equal(h.root.style['--hero-copy-shift'], undefined);
});
