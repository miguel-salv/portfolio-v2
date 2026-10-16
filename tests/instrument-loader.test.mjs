import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRetryableImport } from '../src/scripts/lazy-module.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const source = readFileSync(new URL('../src/scripts/instrument-loader.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function').replace('() => import("./instrument.js")', '() => injectedLoad()');
function setup() {
  let resolve; const pending = new Promise(yes => { resolve = yes; });
  const label = { textContent: 'Open tuner' }, live = {};
  const attrs = new Map([['aria-expanded', 'false']]);
  const toggle = new EventTarget(); toggle.querySelector = () => label;
  toggle.setAttribute = (key, value) => attrs.set(key, String(value));
  toggle.getAttribute = key => attrs.get(key);
  toggle.removeAttribute = key => attrs.delete(key);
  toggle.click = () => toggle.dispatchEvent(new Event('click', { cancelable: true }));
  const root = { dataset: {}, isConnected: true, closest: () => null, querySelector: () => live };
  const document = new EventTarget(); document.querySelector = selector => selector === '[data-instrument]' ? root : toggle;
  let timerId = 0, mounts = 0; const timers = new Map();
  const window = { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
  const scope = { window, document, AbortController, createRetryableImport, injectedLoad: () => pending };
  runInNewContext(source, scope);
  const cleanup = scope.mountInstrumentLoader(root, { load: () => pending });
  const module = { mountInstrument() { mounts++; toggle.setAttribute('aria-expanded', 'true'); } };
  return { root, toggle, label, live, timers, cleanup, document, resolve: () => resolve(module), get mounts() { return mounts; } };
}

test('cancelled navigation remounts an already open tuner without another user click', async () => {
  const h = setup(); h.toggle.click(); h.resolve(); await flush(); assert.equal(h.mounts, 1);
  h.cleanup(); h.document.dispatchEvent(new Event('astro:page-load')); await flush();
  assert.equal(h.mounts, 2); assert.equal(h.toggle.getAttribute('aria-expanded'), 'true');
  h.document.dispatchEvent(new Event('astro:before-preparation'));
});

test('tuner loading ignores a late import after navigation and releases its busy trigger', async () => {
  const h = setup(); h.toggle.click(); await flush(); h.cleanup(); h.resolve(); await flush();
  assert.equal(h.mounts, 0); assert.equal(h.toggle.disabled, false);
  assert.equal(h.toggle.getAttribute('aria-busy'), undefined); assert.equal(h.timers.size, 0);
  assert.equal(h.root.dataset.loaderMounted, undefined);
});

test('a stalled tuner offers retry and cannot mount until a new attempt succeeds', async () => {
  const h = setup(); h.toggle.click(); await flush(); [...h.timers.values()][0](); await flush();
  assert.equal(h.label.textContent, 'Retry the tuner'); assert.equal(h.toggle.disabled, false);
  h.resolve(); await flush(); assert.equal(h.mounts, 0);
  h.toggle.click(); await flush(); assert.equal(h.mounts, 1);
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'true'); h.cleanup();
});

test('repeated clicks during tuner loading share one attempt', async () => {
  const h = setup(); h.toggle.click(); h.toggle.click(); await flush();
  assert.equal(h.timers.size, 1); h.resolve(); await flush(); assert.equal(h.mounts, 1); h.cleanup();
});
