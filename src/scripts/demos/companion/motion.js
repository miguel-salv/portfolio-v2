import { PAGE_MS, easeOutCubic, prefersReducedMotion } from "./theme.js";

const running = new Map();

export function cancelAnim(key) {
  const id = running.get(key);
  if (id) cancelAnimationFrame(id);
  running.delete(key);
}

export function tween({ key, from, to, ms, ease = easeOutCubic, onUpdate, onDone }) {
  cancelAnim(key);
  if (prefersReducedMotion() || ms <= 0) {
    onUpdate?.(to);
    onDone?.();
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    onUpdate?.(from + (to - from) * ease(t));
    if (t < 1) {
      running.set(key, requestAnimationFrame(tick));
    } else {
      running.delete(key);
      onDone?.();
    }
  };
  running.set(key, requestAnimationFrame(tick));
}

export function pingPong({ key, from, to, ms, ease = easeOutCubic, onUpdate }) {
  let dir = 1;
  const loop = (a, b) => {
    tween({
      key,
      from: a,
      to: b,
      ms,
      ease,
      onUpdate,
      onDone() {
        dir *= -1;
        loop(dir > 0 ? from : to, dir > 0 ? to : from);
      },
    });
  };
  if (prefersReducedMotion()) {
    onUpdate?.(to);
    return;
  }
  loop(from, to);
}

export function slidePages({ from, to, sky, upper, onBusy }) {
  const reduced = prefersReducedMotion();
  if (from === to) {
    setSkyY(sky, upper ? 0 : -240);
    return;
  }
  const dir = upper ? -1 : 1;
  const out = dir > 0 ? -240 : 240;
  const inn = dir > 0 ? 240 : -240;

  if (reduced) {
    hidePage(from);
    showPage(to, 0);
    setSkyY(sky, upper ? 0 : -240);
    return;
  }

  onBusy?.(true);
  showPage(to, inn);
  const fromKey = `${from.dataset.pageKey || "from"}-y`;
  const toKey = `${to.dataset.pageKey || "to"}-y`;
  const skyKey = `${sky?.dataset.skyKey || "sky"}-y`;

  tween({
    key: fromKey,
    from: 0,
    to: out,
    ms: PAGE_MS,
    onUpdate: (y) => { from.style.top = `${y}px`; },
    onDone() {
      hidePage(from);
      from.style.top = "0px";
    },
  });
  tween({
    key: toKey,
    from: inn,
    to: 0,
    ms: PAGE_MS,
    onUpdate: (y) => { to.style.top = `${y}px`; },
    onDone() { onBusy?.(false); },
  });
  if (sky) {
    tween({
      key: skyKey,
      from: upper ? -240 : 0,
      to: upper ? 0 : -240,
      ms: PAGE_MS,
      onUpdate: (y) => { sky.style.top = `${Math.round(y)}px`; },
    });
  }
}

export function jumpPages({ hide, show, sky, upper }) {
  if (hide) hidePage(hide);
  if (show) showPage(show, 0);
  setSkyY(sky, upper ? 0 : -240);
}

export function setSkyY(sky, y) {
  if (!sky) return;
  cancelAnim(`${sky.dataset.skyKey || "sky"}-y`);
  sky.style.top = `${y}px`;
}

export function hidePage(el) {
  if (!el) return;
  el.classList.add("kirby-hidden");
  el.setAttribute("aria-hidden", "true");
  el.style.top = "0px";
}

export function showPage(el, y = 0) {
  if (!el) return;
  el.classList.remove("kirby-hidden");
  el.removeAttribute("aria-hidden");
  el.style.top = `${y}px`;
}

export function pageBusy(...pages) {
  return pages.some((p) => p && running.has(`${p.dataset.pageKey || ""}-y`));
}
