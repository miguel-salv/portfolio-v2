import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRetryableImport } from '../src/scripts/lazy-module.js';

const base = 'https://portfolio.test/project.html';
const module = { mount() {} };
test('an explicit retry bypasses a browser-cached local module failure', async () => {
  let originalCalls = 0; const requests = [];
  const load = createRetryableImport(() => { originalCalls++; throw new TypeError('Failed to fetch dynamically imported module: https://portfolio.test/_astro/robot.js'); }, {
    base, nonce: () => 'test', importFresh: async url => { requests.push(url); return module; }, validate: value => typeof value.mount === 'function',
  });
  await assert.rejects(load()); assert.equal(load.needsReload(), false);
  assert.equal(await load(), module); assert.equal(originalCalls, 1);
  assert.equal(requests[0], 'https://portfolio.test/_astro/robot.js?portfolio-retry=test-1');
});
test('repeated failed retries use a new URL each time', async () => {
  const requests = [], error = new TypeError('Failed to fetch dynamically imported module: https://portfolio.test/_astro/robot.js');
  const load = createRetryableImport(() => Promise.reject(error), { base, nonce: () => 'test', importFresh: async url => { requests.push(url); throw error; } });
  await assert.rejects(load()); await assert.rejects(load()); await assert.rejects(load());
  assert.equal(new Set(requests).size, 2);
});
test('unidentified or cross-origin import errors require ordinary page recovery', async () => {
  for (const message of ['Importing a module script failed.', 'Failed to fetch https://external.test/code.js', 'Failed https://portfolio.test/image.jpg']) {
    const load = createRetryableImport(() => Promise.reject(new TypeError(message)), { base });
    await assert.rejects(load()); assert.equal(load.needsReload(), true);
  }
});
test('a failed nested dependency cannot be mistaken for the requested demo', async () => {
  const load = createRetryableImport(() => Promise.reject(new TypeError('Failed to fetch https://portfolio.test/_astro/platform.js')), {
    base, importFresh: async () => ({ createLoop() {} }), validate: value => typeof value.mount === 'function',
  });
  await assert.rejects(load()); await assert.rejects(load()); assert.equal(load.needsReload(), true);
});
