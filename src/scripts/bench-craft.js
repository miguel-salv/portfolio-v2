import { createDisclosure } from './bench-disclosure.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const phone = window.matchMedia('(max-width: 760px)');
let cleanup = () => {};
const clamp = (n) => Math.max(0, Math.min(1, n));
const ease = 'cubic-bezier(.16, 1, .3, 1)';

function initBenchCraft() {
  cleanup();
  if (!document.querySelector('[data-workshop-hero]')) return;
  const controller = new AbortController();
  const { signal } = controller;
  const observers = [], disposers = [], animations = new Map();
  let frame = 0;
  const motionAllowed = () => !reduced.matches && !document.hidden;
  const animate = (node, frames, duration = 380) => {
    if (!node?.animate || !motionAllowed()) return;
    // Repeated input starts from the currently displayed pose.
    const current = getComputedStyle(node).transform;
    animations.get(node)?.cancel();
    const animation = node.animate([{ transform: current }, ...frames], { duration, easing: ease });
    animations.set(node, animation);
    animation.finished.then(() => { if (animations.get(node) === animation) animations.delete(node); }, () => {});
  };

  const sectionIntros = [...document.querySelectorAll('.workshop-section-intro, .projects-intro')];
  const photoGroup = document.querySelector('.projects-grid');
  const portrait = document.querySelector('.portrait-card');
  const ruleRoots = [document.querySelector('.bay-career .section-head')].filter(Boolean);
  ruleRoots.forEach(node => node.classList.add('bench-rule'));
  // Observe parents that never move, so reverse scrolling cannot feed back into geometry.
  const spatialRoots = [...new Set([...sectionIntros, ...ruleRoots, photoGroup, portrait].filter(Boolean))];
  const visible = new Set(spatialRoots);
  const selections = [];

  const addSelection = (root, selector) => {
    if (!root) return;
    const line = document.createElement('span');
    line.className = 'bench-selection';
    line.setAttribute('aria-hidden', 'true');
    root.append(line);
    root.classList.add('has-bench-selection');
    let last = '', placed = false;
    const update = (instant = false) => {
      const selected = root.querySelector(selector);
      if (!selected || root.hidden || !root.getBoundingClientRect().width) {
        line.classList.remove('is-placed'); last = ''; return;
      }
      const parent = root.getBoundingClientRect(), rect = selected.getBoundingClientRect();
      const inset = 0;
      const transform = `translateX(${(rect.left - parent.left + inset).toFixed(2)}px) scaleX(${Math.max(1, rect.width - inset * 2).toFixed(2)})`;
      if (transform === last) return;
      line.classList.toggle('is-traveling', placed && !instant && motionAllowed());
      line.style.transform = transform;
      line.classList.add('is-placed');
      placed = true; last = transform;
    };
    const observer = new MutationObserver(() => requestPaint());
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'aria-pressed', 'hidden'] });
    observers.push(observer);
    selections.push(update);
    disposers.push(() => { line.remove(); root.classList.remove('has-bench-selection'); });
  };

  const paint = (instant = false) => {
    frame = 0;
    if (signal.aborted || document.hidden) return;
    const height = window.innerHeight;
    const enabled = !reduced.matches && !phone.matches;
    document.body.classList.toggle('bench-scroll-ready', enabled);
    // All geometry reads precede style writes; no new permanent render loop.
    const measurements = spatialRoots.filter(root => visible.has(root)).map(root => [root, root.getBoundingClientRect()]);
    for (const [root, rect] of measurements) {
      const entry = enabled ? clamp((height * .92 - rect.top) / (height * .46)) : 1;
      const seated = 1 - Math.pow(1 - entry, 3);
      if (ruleRoots.includes(root)) root.style.setProperty('--bench-rule', String(.16 + .84 * seated));
      if (sectionIntros.includes(root)) {
        root.style.setProperty('--bench-heading-y', `${((1 - seated) * 24).toFixed(2)}px`);
        root.style.setProperty('--bench-copy-y', `${((1 - seated) * 10).toFixed(2)}px`);
      }
      if (root === photoGroup) root.style.setProperty('--bench-photo-y', `${((1 - seated) * 22).toFixed(2)}px`);
      if (root === portrait) {
        const travel = enabled ? (clamp((height - rect.top) / (height + rect.height)) - .5) * 20 : 0;
        root.style.setProperty('--bench-portrait-y', `${travel.toFixed(2)}px`);
      }
    }
    selections.forEach(update => update(instant));
  };
  const requestPaint = () => {
    if (!frame && !document.hidden && !signal.aborted) frame = requestAnimationFrame(() => paint());
  };
  addSelection(document.querySelector('[data-matcher-modes]'), 'button[aria-pressed="true"]');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      requestPaint();
    }, { rootMargin: '100px 0px' });
    spatialRoots.forEach(root => observer.observe(root));
    observers.push(observer);
  }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => { selections.forEach(update => update(true)); requestPaint(); });
    [document.querySelector('[data-matcher-modes]'), ...spatialRoots].filter(Boolean).forEach(root => observer.observe(root));
    observers.push(observer);
  }
  window.addEventListener('scroll', requestPaint, { passive: true, signal });
  window.addEventListener('resize', requestPaint, { passive: true, signal });
  document.addEventListener('toggle', requestPaint, { capture: true, signal });

  document.querySelectorAll('.role-details').forEach(details => {
    disposers.push(createDisclosure(details, { reduced, signal, onLayout: requestPaint }));
  });
  document.querySelectorAll('.workshop-play-button, .instrument-btn, [data-matcher-part]').forEach(button => {
    button.addEventListener('click', () => animate(button.querySelector('svg') || button, [
      { transform: 'translateY(3px)' }, { transform: 'translateY(-1px)' }, { transform: 'none' }
    ]), { signal });
  });

  const status = document.querySelector('.instrument-status');
  if (status) {
    let matched = status.classList.contains('is-matched');
    const observer = new MutationObserver(() => {
      const next = status.classList.contains('is-matched');
      if (next !== matched) status.classList.toggle('bench-matched', next && motionAllowed());
      matched = next;
    });
    observer.observe(status, { attributes: true, attributeFilter: ['class'] });
    observers.push(observer);
    disposers.push(() => status.classList.remove('bench-matched'));
  }

  const halt = () => {
    animations.forEach(animation => animation.cancel()); animations.clear();
    if (frame) cancelAnimationFrame(frame); frame = 0;
    status?.classList.remove('bench-matched');
    selections.forEach(update => update(true));
    requestPaint();
  };
  reduced.addEventListener('change', halt, { signal });
  phone.addEventListener('change', requestPaint, { signal });
  document.addEventListener('visibilitychange', halt, { signal });
  paint(true);
  cleanup = () => {
    controller.abort();
    if (frame) cancelAnimationFrame(frame);
    animations.forEach(animation => animation.cancel());
    observers.forEach(observer => observer.disconnect());
    disposers.forEach(dispose => dispose());
    document.body.classList.remove('bench-scroll-ready');
    spatialRoots.forEach(root => {
      root.classList.remove('bench-rule');
      ['--bench-rule', '--bench-heading-y', '--bench-copy-y', '--bench-photo-y', '--bench-portrait-y'].forEach(key => root.style.removeProperty(key));
    });
  };
}

document.addEventListener('astro:page-load', initBenchCraft);
document.addEventListener('astro:before-preparation', () => cleanup());
