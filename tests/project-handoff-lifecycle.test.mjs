import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const core = readFileSync(new URL('../src/scripts/portfolio-core.js', import.meta.url), 'utf8');
const reset = core.slice(core.indexOf('function resetProjectHandoff'), core.indexOf('\ninstallNavigationGuard'));
const destination = core.slice(core.indexOf('const runProjectFlipDestination'), core.indexOf('\n// The photograph already supplies', core.indexOf('const runProjectFlipDestination')));
function harness(kind = 'continuation') {
  const classes = new Set(), frames = [], animations = [], nodes = [];
  const classList = {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    contains: name => classes.has(name),
    toggle: (name, on) => on ? classes.add(name) : classes.delete(name)
  };
  const makeNode = () => {
    const node = {
      style: {}, isConnected: true, naturalWidth: 1200, naturalHeight: 900,
      classList: { add: name => { node.revealed = name === 'project-flip-complete'; } },
      setAttribute() {}, decode: () => Promise.resolve(),
      getBoundingClientRect: () => ({ left: 760, top: 150, width: 620, height: 465 }),
      appendChild(child) { child.parentNode = node; },
      insertBefore(child) { child.parentNode = node; },
      remove() { node.isConnected = false; },
      animate(keyframes, timing) {
        let resolve, reject, observed = false;
        const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
        const animation = {
          keyframes, timing, cancelled: false,
          get finished() { observed = true; return finished; },
          finish() { resolve(); },
          cancel() { this.cancelled = true; if (observed) reject(new Error('Cancelled')); }
        };
        animations.push(animation); return animation;
      }
    };
    nodes.push(node); return node;
  };
  const target = makeNode(), image = makeNode(), stage = makeNode();
  target.querySelector = () => image;
  const stored = new Map([['project-image-handoff', JSON.stringify({
    kind, path: '/project-robot.html', src: '/robot.webp', time: Date.now(),
    rect: { left: 140, top: 680, width: 224, height: 168 }
  })]]);
  const window = new EventTarget();
  Object.assign(window, { scrollX: 0, scrollY: 0, setTimeout: () => 1, clearTimeout() {} });
  const document = {
    body: { classList: { contains: () => true } }, documentElement: { classList },
    querySelector: selector => selector === '.project-hero-media' ? target : nodes.find(node => node.isConnected && `.${node.className}` === selector),
    getElementById: () => stage, createElement: makeNode
  };
  const context = {
    document, window, location: { pathname: '/project-robot.html' }, AbortController,
    getComputedStyle: () => ({ objectPosition: '50% 50%' }),
    prefersReducedMotion: () => false,
    requestAnimationFrame: callback => frames.push(callback),
    sessionStorage: { getItem: key => stored.get(key), removeItem: key => stored.delete(key) }
  };
  runInNewContext(`let activeProjectFlip = null;\n${reset}\n${destination}\nrunProjectFlipDestination();\nwindow.stopFlight = resetProjectHandoff;`, context);
  const flush = async () => {
    for (let n = 0; n < 8; n++) {
      await Promise.resolve();
      const queued = frames.splice(0); queued.forEach(callback => callback());
    }
  };
  return { window, target, nodes, classes, frames, animations, stored, flush };
}

test('next-project image settles into the hero and releases its temporary layers', async () => {
  const h = harness(); await h.flush();
  assert.equal(h.animations[0].timing.duration, 420);
  assert.ok(h.classes.has('project-flip-continuation'));
  h.animations.forEach(animation => animation.finish()); await h.flush();
  assert.ok(h.target.revealed);
  assert.ok(!h.classes.has('project-flip-running'));
  assert.ok(!h.nodes.some(node => node.isConnected && node.className?.startsWith('project-flip-')));
  assert.equal(h.stored.size, 0);
});

test('homepage handoffs retain their original duration', async () => {
  const h = harness('card'); await h.flush();
  assert.equal(h.animations[0].timing.duration, 560);
  assert.ok(!h.classes.has('project-flip-continuation'));
  h.window.stopFlight(); await h.flush();
});

test('interrupted navigation cancels the flight without a hidden hero or stale cleanup', async () => {
  const h = harness(); await h.flush(); h.window.stopFlight(); await h.flush();
  assert.ok(h.animations.every(animation => animation.cancelled));
  assert.ok(h.target.revealed);
  assert.equal(h.classes.size, 0);
  assert.ok(!h.nodes.some(node => node.isConnected && node.className?.startsWith('project-flip-')));
});

test('cancellation while decoding prevents a late animation from starting', async () => {
  const h = harness(); h.window.stopFlight(); await h.flush();
  assert.equal(h.animations.length, 0);
  assert.ok(h.target.revealed);
  assert.equal(h.classes.size, 0);
});

test('resize settles the image and leaves the actual responsive hero visible', async () => {
  const h = harness(); await h.flush(); h.window.dispatchEvent(new Event('resize')); await h.flush();
  assert.ok(h.target.revealed);
  assert.equal(h.classes.size, 0);
  assert.ok(!h.nodes.some(node => node.isConnected && node.className?.startsWith('project-flip-')));
});


test('only a fresh continuation skips the competing document snapshot', () => {
  const source = core.slice(core.indexOf('const skipContinuationSnapshot'), core.indexOf('document.addEventListener("astro:before-swap", skipContinuationSnapshot)'));
  let stored = { kind: 'continuation', path: '/project-robot.html', time: Date.now() }, skipped = 0, reduced = false;
  const context = { Date, prefersReducedMotion: () => reduced,
    sessionStorage: { getItem: () => JSON.stringify(stored) },
    window: {} };
  runInNewContext(source + '\nwindow.skip = skipContinuationSnapshot;', context);
  const event = { signal: { aborted: false }, navigationType: 'push', to: { pathname: '/project-robot.html' }, viewTransition: { skipTransition: () => skipped++ } };
  context.window.skip(event); assert.equal(skipped, 1);
  for (const patch of [{ kind: 'card' }, { time: Date.now() - 6000 }, { path: '/project-vehicle.html' }]) {
    stored = { kind: 'continuation', path: '/project-robot.html', time: Date.now(), ...patch };
    context.window.skip(event); assert.equal(skipped, 1);
  }
  stored = { kind: 'continuation', path: '/project-robot.html', time: Date.now() };
  context.window.skip({ ...event, navigationType: 'traverse' });
  context.window.skip({ ...event, signal: { aborted: true } });
  reduced = true; context.window.skip(event);
  assert.equal(skipped, 1);
});
