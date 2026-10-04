import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDisclosure } from '../src/scripts/bench-disclosure.js';

function setup() {
  const summary = new EventTarget();
  summary.attrs = new Map();
  summary.setAttribute = (key, value) => summary.attrs.set(key, value);
  summary.removeAttribute = key => summary.attrs.delete(key);
  summary.getBoundingClientRect = () => ({ height: 56 });
  const details = new EventTarget();
  details.open = false;
  details.style = {};
  details.querySelector = () => summary;
  details.getBoundingClientRect = () => ({ height: details.open ? 200 : 56 });
  const records = [];
  details.animate = (frames, options) => {
    let resolve, reject;
    const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
    const record = { frames, options, finished, resolve, cancel() { reject(new Error('cancelled')); } };
    records.push(record);
    return record;
  };
  const reduced = new EventTarget(); reduced.matches = false;
  globalThis.document = new EventTarget(); document.hidden = false;
  globalThis.window = new EventTarget();
  const controller = new AbortController();
  const dispose = createDisclosure(details, { reduced, signal: controller.signal });
  const click = () => { const event = new Event('click', { cancelable: true }); summary.dispatchEvent(event); return event; };
  return { details, summary, reduced, records, controller, dispose, click };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('rapid open/close/open ends open; stale completion cannot close current content', async () => {
  const p = setup();
  p.click(); p.click(); p.click();
  p.records[1].resolve(); await tick();
  assert.equal(p.details.open, true);
  assert.equal(p.summary.attrs.get('aria-expanded'), 'true');
  p.records[2].resolve(); await tick();
  assert.equal(p.details.open, true);
  assert.equal(p.summary.attrs.has('aria-expanded'), false);
  assert.equal(p.details.style.height, '');
  p.controller.abort(); p.dispose();
});

test('reverse begins at the displayed height and closing commits only on settle', async () => {
  const p = setup(); p.click();
  p.details.getBoundingClientRect = () => ({ height: 117 });
  p.click();
  assert.equal(p.records[1].frames[0].height, '117px');
  assert.equal(p.details.open, true);
  assert.equal(p.summary.attrs.get('aria-expanded'), 'false');
  p.records[1].resolve(); await tick();
  assert.equal(p.details.open, false);
  p.controller.abort(); p.dispose();
});

test('reduced motion keeps native activation; preference change seats latest input', async () => {
  const p = setup(); p.click(); p.click();
  p.reduced.matches = true; p.reduced.dispatchEvent(new Event('change'));
  assert.equal(p.details.open, false);
  assert.equal(p.click().defaultPrevented, false);
  assert.equal(p.records.length, 2);
  await tick(); p.controller.abort(); p.dispose();
});

test('resize, visibility, and navigation cancel height locks without stale DOM changes', async () => {
  for (const type of ['resize', 'visibilitychange', 'cleanup']) {
    const p = setup(); p.click();
    if (type === 'resize') window.dispatchEvent(new Event(type));
    else if (type === 'visibilitychange') { document.hidden = true; document.dispatchEvent(new Event(type)); }
    else { p.controller.abort(); p.dispose(); }
    p.records[0].resolve(); await tick();
    assert.equal(p.details.open, true);
    assert.equal(p.details.style.overflow, '');
    assert.equal(p.summary.attrs.has('aria-expanded'), false);
    p.controller.abort(); p.dispose();
  }
});
