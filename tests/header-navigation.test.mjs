import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const core = readFileSync(new URL('../src/scripts/portfolio-core.js', import.meta.url), 'utf8');
const start = core.indexOf('document.addEventListener("click",', core.indexOf('motionQuery.addEventListener?.'));
const handler = core.slice(start, core.indexOf('\nwindow.addEventListener("hashchange"', start));

function setup(pathname = '/resume/') {
  const listeners = [], navigations = [], scrolls = [], saved = new Map(), jumps = [];
  class Link {
    constructor(href, header) { this.href = `http://localhost${href}`; this.dataset = header ? { navItem: href.includes('contact') ? 'contact' : 'projects' } : {}; this.classList = { contains: () => false }; }
    closest() { return this; }
  }
  const document = { addEventListener(type, callback, options) { listeners.push({ callback, capture: options?.capture }); } };
  const window = { location: { href: `http://localhost${pathname}`, pathname, origin: 'http://localhost', hash: '' } };
  runInNewContext(handler, { document, window, Element: Link, URL, history: { state: {} },
    navigate: (href) => navigations.push(href),
    resolveHashTarget: () => ({}), scrollToHash: hash => scrolls.push(hash),
    prefersReducedMotion: () => false, focusHashTarget() {}, setMobileMenuState() {},
    sectionNavigation: { go: (url, item) => jumps.push({ hash: url.hash, item }) },
    sessionStorage: { setItem: (key, value) => saved.set(key, value) }
  });
  const click = (href, modified = false, header = false) => {
    const event = new Event('click', { cancelable: true });
    Object.defineProperty(event, 'target', { value: new Link(href, header) });
    Object.assign(event, { button: 0, metaKey: modified });
    // Astro's router installs first in the document bubble phase. Browser capture
    // must let the portfolio own its restoration before that router sees a click.
    const router = { capture: false, callback: e => { if (!e.defaultPrevented && !e.metaKey) navigations.push('router'); } };
    [router, ...listeners].sort((a, b) => Number(!!b.capture) - Number(!!a.capture)).forEach(listener => listener.callback(event));
    return event;
  };
  return { click, navigations, scrolls, saved, jumps };
}

test('Resume-to-Career navigation records its destination before Astro handles the click', () => {
  const h = setup();
  assert.ok(h.click('/#career').defaultPrevented);
  assert.deepEqual(h.navigations, ['/']);
  assert.equal(h.saved.get('portfolio-scroll'), '#career');
});

test('ordinary homepage hashes retain the portfolio scroll path', () => {
  const h = setup('/'); h.click('/#contact');
  assert.deepEqual(h.navigations, ['http://localhost/#contact']);
  assert.deepEqual(h.scrolls, ['#contact']);
});

test('header section clicks use one direct transition and never start smooth scrolling', () => {
  const h = setup('/'); h.click('/#contact', false, true);
  assert.deepEqual(h.jumps, [{ hash: '#contact', item: 'contact' }]);
  assert.deepEqual(h.navigations, []);
  assert.deepEqual(h.scrolls, []);
});

test('modified clicks retain native new-tab navigation', () => {
  const h = setup();
  assert.equal(h.click('/#career', true).defaultPrevented, false);
  assert.deepEqual(h.navigations, []);
  assert.equal(h.saved.size, 0);
});
