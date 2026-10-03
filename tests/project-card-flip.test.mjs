import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const core = readFileSync(new URL('../src/scripts/portfolio-core.js', import.meta.url), 'utf8');
const source = core.slice(core.indexOf('const initializedProjectCards'), core.indexOf('const runProjectFlipDestination'));
function harness() {
  const stored = new Map(), clones = [];
  let reduced = false;
  const frame = { left: 100, top: 200, width: 400, height: 300 };
  const zoomed = { left: 80, top: 185, width: 440, height: 330 };
  const image = { complete: true, naturalWidth: 1200, currentSrc: '/vehicle.webp', alt: 'Vehicle', getBoundingClientRect: () => zoomed };
  const picture = { querySelector: () => image, getBoundingClientRect: () => frame };
  const paths = ['project-impedance.html', '/project-impedance.html', '/project-vehicle.html', '/project-robot.html'];
  const cards = paths.map(path => {
    const card = new EventTarget();
    card.href = new URL(path, 'http://localhost/').href;
    card.path = path;
    card.closest = () => null;
    card.querySelector = () => picture;
    return card;
  });
  const stage = { querySelector: () => null, append: (...nodes) => clones.push(...nodes) };
  const document = {
    querySelectorAll(selector) {
      const prefixes = [...selector.matchAll(/href\^='([^']+)'/g)].map(match => match[1]);
      return cards.filter(card => prefixes.some(prefix => card.path.startsWith(prefix)));
    },
    getElementById: () => stage,
    createElement: () => ({ style: {}, setAttribute() {} }),
    head: { appendChild() {} }, body: stage
  };
  runInNewContext(source + '\nsetupProjectCards();', {
    document, window: { scrollX: 0, scrollY: 600, setTimeout, clearTimeout },
    location: { href: 'http://localhost/' }, URL, Date, Math, WeakSet,
    prefersReducedMotion: () => reduced,
    getComputedStyle: node => node === image
      ? { objectPosition: '50% 56%', filter: 'url("#photo-vehicle")' }
      : { borderTopWidth: '0', borderRightWidth: '0', borderBottomWidth: '0', borderLeftWidth: '0' },
    sessionStorage: { setItem: (key, value) => stored.set(key, value) }
  });
  function click(card, extra = {}) {
    const event = new Event('click');
    Object.assign(event, { button: 0, ...extra });
    card.dispatchEvent(event);
  }
  return { cards, stored, clones, click, reduce: () => { reduced = true; } };
}

test('relative and root-relative project cards all retain their FLIP handoff', () => {
  const h = harness();
  for (const card of h.cards) {
    h.click(card);
    const handoff = JSON.parse(h.stored.get('project-image-handoff'));
    assert.equal(handoff.path, new URL(card.href).pathname);
  }
});

test('FLIP captures the clipped aperture separately from its zoomed photograph', () => {
  const h = harness(); h.click(h.cards[2]);
  const handoff = JSON.parse(h.stored.get('project-image-handoff'));
  assert.deepEqual(handoff.rect, { left: 100, top: 200, width: 400, height: 300 });
  assert.deepEqual(handoff.sourceImageRect, { left: 80, top: 185, width: 440, height: 330 });
  assert.equal(handoff.objectPosition, '50% 56%');
  assert.equal(handoff.filter, 'url("#photo-vehicle")');
  const clone = h.clones.find(node => node.className === 'project-flip-clone');
  assert.equal(clone.style.clipPath, 'inset(15px 20px 15px 20px)');
  assert.equal(clone.style.filter, handoff.filter);
});

test('modified clicks keep ordinary browser navigation without a flying image', () => {
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const h = harness(); h.click(h.cards[1], extra);
    assert.equal(h.stored.size, 0); assert.equal(h.clones.length, 0);
  }
});

test('switching to reduced motion disables already-attached FLIP handlers', () => {
  const h = harness(); h.reduce(); h.click(h.cards[1]);
  assert.equal(h.stored.size, 0); assert.equal(h.clones.length, 0);
});
