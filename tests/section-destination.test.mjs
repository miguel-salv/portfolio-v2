import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installSectionDestinationCover } from '../src/scripts/section-navigation.js';
import { installNavigationGuard } from '../src/scripts/navigation-guard.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function setup({ hash = '#about', surface = 'home', cancelled = false, navigationType = 'push', exists = true } = {}) {
  const document = new EventTarget(), window = { __portfolioScrollY: 1039, location: { href: 'http://localhost/resume/' } };
  document.body = { page: 'resume' };
  const saved = new Map([['portfolio-scroll', hash]]);
  const storage = { getItem: key => saved.get(key), removeItem: key => saved.delete(key) };
  const destination = {
    documentElement: { dataset: { surface }, classList: new Set() },
    getElementById: () => exists ? {} : null
  };
  installNavigationGuard({ document, window, resetHandoff() {} });
  installSectionDestinationCover({ document, window, storage });
  const event = new Event('astro:before-swap');
  event.newDocument = destination; event.navigationType = navigationType;
  event.signal = { aborted: cancelled };
  const paints = [];
  event.swap = () => {
    document.body = { page: surface };
    paints.push(destination.documentElement.classList.has('hash-pending'));
  };
  document.dispatchEvent(event);
  return { window, saved, paints, event, document };
}

for (const hash of ['#about', '#career', '#contact', '#project-matcher']) {
  test(`Resume return to ${hash} covers the first homepage frame and restores the explicit section`, () => {
    const h = setup({ hash }); h.event.swap();
    assert.deepEqual(h.paints, [true]);
    assert.equal(h.window.__portfolioHash, hash);
    assert.equal(h.window.__portfolioExplicitHash, true);
    assert.equal(h.window.__portfolioRestoringScroll, true);
    assert.equal(h.window.__portfolioScrollY, undefined, 'a previous model position cannot override the chosen section');
    assert.equal(h.saved.has('portfolio-scroll'), false);
  });
}

test('a cancelled swap cannot cover or change the surviving Resume page', () => {
  const h = setup({ cancelled: true }); h.event.swap();
  assert.deepEqual(h.paints, []);
  assert.equal(h.document.body.page, 'resume');
  assert.equal(h.window.__portfolioHash, undefined);
  assert.equal(h.window.__portfolioRestoringScroll, undefined);
});

test('history restoration and unrelated pages retain their existing navigation behavior', () => {
  for (const options of [{ navigationType: 'traverse' }, { surface: 'project' }, { hash: '' }, { exists: false }]) {
    const h = setup(options); h.event.swap();
    assert.deepEqual(h.paints, [false]);
    assert.equal(h.window.__portfolioExplicitHash, undefined);
  }
});

test('fixed scene artwork is reconciled synchronously before the restored page becomes visible', () => {
  const source = readFileSync(new URL('../src/scripts/portfolio-core.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function revealRestoredScroll()'), source.indexOf('function finishRestoreTo('));
  const events = [], frames = [], document = new EventTarget();
  const window = { __portfolioRestoringScroll: true, requestAnimationFrame: callback => frames.push(callback) };
  document.documentElement = { classList: { remove: () => events.push('reveal') } };
  document.addEventListener('portfolio:section-navigation-settle', () => {
    assert.equal(window.__portfolioRestoringScroll, true);
    events.push('hide-offscreen-artwork');
  });
  document.addEventListener('portfolio:scroll-restored', () => events.push('restored'));
  runInNewContext(`${code}\nrevealRestoredScroll();`, { document, window, CustomEvent, Event,
    syncHeaderSolid() {}, pinScrollRestoration() {}, schedulePageReveals() {}, restoreInFlight: true });
  frames.shift()();
  assert.deepEqual(events, ['hide-offscreen-artwork', 'reveal', 'restored']);
  assert.equal(window.__portfolioRestoringScroll, undefined);
});
