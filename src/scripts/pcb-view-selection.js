// A request owns its completion. An older load or exit never wins a new input.
export function createPcbViewSelection(frame, buttons, {
  prepare, reveal, fail,
  reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  setTimer = (fn, ms) => window.setTimeout(fn, ms),
  clearTimer = id => window.clearTimeout(id),
}) {
  let generation = 0;
  let exitTimer = 0;
  let disposed = false;
  const views = () => Array.from(frame.querySelectorAll("kicanvas-embed.pcb-view"));
  const settle = () => {
    clearTimer(exitTimer);
    exitTimer = 0;
    for (const view of views()) view.classList.remove("is-switching-in", "is-switching-out");
  };
  const clearBusy = () => buttons.forEach(button => button.removeAttribute("aria-busy"));

  async function request(name) {
    if (disposed) return;
    const ticket = ++generation;
    settle();
    clearBusy();
    const button = buttons.find(item => item.dataset.pcbView === name);
    button?.setAttribute("aria-busy", "true");
    let ready = false;
    try { ready = await prepare(name); } catch (_) { /* Recovery belongs to the current request only. */ }
    if (disposed || ticket !== generation || !frame.isConnected) return;
    clearBusy();
    const next = views().find(view => view.dataset.view === name);
    if (!ready || !next) { fail(); return; }
    const previous = views().find(view => view.classList.contains("active"));
    if (previous && previous !== next && previous.contains(document.activeElement)) button?.focus({ preventScroll: true });

    for (const view of views()) {
      const active = view === next;
      view.classList.toggle("active", active);
      view.inert = !active;
      view.setAttribute("aria-hidden", String(!active));
    }
    for (const item of buttons) {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    }
    if (previous && previous !== next && !reduced()) {
      previous.classList.add("is-switching-out");
      next.classList.add("is-switching-in");
      exitTimer = setTimer(() => { if (ticket === generation && !disposed) settle(); }, 170);
    }
    reveal(next);
  }

  return { request, destroy() { disposed = true; generation++; settle(); clearBusy(); } };
}
