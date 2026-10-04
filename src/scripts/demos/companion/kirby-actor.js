import { spr } from './components/ui.js';
import { playKirbyHop } from './audio.js';
import { asset, easeInCubic, easeOutCubic, prefersReducedMotion } from './theme.js';
import { cancelAnim, tween } from './motion.js';

let actorId = 0;

export function createKirbyActor(parent, x, y, interactive) {
  const img = spr('kirby-idle.png', x, y, 64, 64);
  img.classList.add('kirby-actor');
  img.alt = 'Kirby'; parent.appendChild(img);
  const key = `kirby-response-${++actorId}`;
  const timers = new Set();
  const restY = y;
  let disposed = false;
  let paused = false;
  let generation = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pose = name => { img.src = asset(`kirby-${name}.png`); };
  function later(fn, ms) {
    const current = generation;
    const id = window.setTimeout(() => { timers.delete(id); if (!disposed && !paused && current === generation) fn(); }, ms);
    timers.add(id);
  }
  function cancel() {
    generation++; timers.forEach(id => clearTimeout(id)); timers.clear(); cancelAnim(key);
  }
  function rest() { cancel(); pose('idle'); img.style.top = `${restY}px`; }
  function travel(from, to, ms, ease, done) {
    const current = generation;
    tween({ key, from, to, ms, ease, onUpdate: value => { img.style.top = `${value}px`; }, onDone: () => { if (!disposed && !paused && current === generation) done?.(); } });
  }
  function tapHop() {
    if (!interactive || disposed || paused) return;
    const start = parseFloat(img.style.top) || restY;
    cancel(); playKirbyHop(); pose('squash');
    if (prefersReducedMotion()) { img.style.top = `${restY}px`; later(rest, 240); return; }
    travel(start, restY + 3, 75, easeInCubic, () => {
      pose('idle'); travel(restY + 3, restY - 16, 110, easeOutCubic, () => {
        travel(restY - 16, restY, 130, easeInCubic, () => {
          pose('squash'); later(() => { pose('idle'); travel(restY, restY - 4, 70, easeOutCubic, () => travel(restY - 4, restY, 80, easeInCubic, rest)); }, 45);
        });
      });
    });
  }
  if (interactive) {
    img.classList.add('kirby-actor--live'); img.tabIndex = 0;
    img.setAttribute('role', 'button'); img.setAttribute('aria-label', 'Kirby, tap to hop');
    img.addEventListener('click', event => { event.stopPropagation(); tapHop(); });
    img.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); tapHop(); } });
  }
  function catchHop() {
    if (disposed || paused) return;
    cancel();
    if (prefersReducedMotion()) return;
    travel(restY, restY - 8, 90, easeOutCubic, () => travel(restY - 8, restY, 90, easeInCubic, rest));
  }
  rest();
  motion.addEventListener('change', rest);
  return { el: img, catchHop, setX(nx) { img.style.left = `${nx}px`; }, restY,
    pause() { paused = true; rest(); }, resume() { paused = false; },
    destroy() { disposed = true; rest(); motion.removeEventListener('change', rest); },
  };
}
