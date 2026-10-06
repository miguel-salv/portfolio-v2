// Header destinations are direct navigation, rather than a tour through the
// scroll-driven scenes. Only the content fades; the persistent header stays live.
export function installSectionDestinationCover({ document, window, storage }) {
  document.addEventListener('astro:before-swap', event => {
    const destination = event.newDocument;
    if (destination.documentElement.dataset.surface !== 'home' || event.navigationType === 'traverse') return;
    let hash;
    try { hash = storage.getItem('portfolio-scroll'); } catch { return; }
    if (!hash || hash === '#') return;
    let target;
    try { target = destination.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
    if (!target) return;

    // Astro runs identical inline scripts only once. On a client-side return,
    // install the restoration cover before the homepage can paint at the top.
    destination.documentElement.classList.add('hash-pending');
    const swap = event.swap;
    event.swap = () => {
      const source = document.body;
      swap();
      if (document.body === source) return;
      window.__portfolioHash = hash;
      window.__portfolioExplicitHash = true;
      window.__portfolioRestoringScroll = true;
      delete window.__portfolioScrollY;
      try { storage.removeItem('portfolio-scroll'); } catch { /* Restoration also works without storage. */ }
    };
  });
}

export function createSectionNavigation({ document, window, reduced, move, updateHistory, reveal }) {
  let current = null, cover = null, animation = null;
  const emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(`portfolio:section-${name}`, { detail }));
  const frame = () => new Promise(resolve => window.requestAnimationFrame(resolve));

  function clear() {
    animation?.cancel(); animation = null;
    cover?.remove(); cover = null;
    document.documentElement.classList.remove('section-navigating');
    delete window.__portfolioSectionNavigation;
    current = null;
    emit('navigation-end');
  }
  async function fade(opacity, duration) {
    const from = Number(window.getComputedStyle(cover).opacity);
    animation?.cancel();
    const next = cover.animate([{ opacity: from }, { opacity }], {
      duration, easing: 'ease-out', fill: 'forwards'
    });
    animation = next;
    await next.finished.catch(() => {});
  }
  async function go(url, item) {
    const request = {};
    current = request;
    window.__portfolioSectionNavigation = true;
    document.documentElement.classList.add('section-navigating');
    emit('navigation-start', { item });
    if (!cover && !reduced.matches) {
      cover = document.createElement('div');
      cover.className = 'section-navigation-cover';
      cover.setAttribute('aria-hidden', 'true');
      document.body.append(cover);
    }
    try {
      if (cover && !reduced.matches) await fade(1, 110);
      if (current !== request) return;
      await updateHistory(url);
      if (current !== request) return;
      move(url.hash);
      const checks = [];
      emit('navigation-settle', { ready: check => checks.push(check) });
      reveal();
      // Decode the destination underneath the cover. Network stalls cannot
      // trap navigation: the existing poster remains the loading fallback.
      const deadline = window.performance.now() + 420;
      do {
        await frame();
        if (current !== request) return;
      } while (checks.some(check => !check()) && window.performance.now() < deadline && !document.hidden);
      if (cover && !reduced.matches) await fade(0, 160);
    } finally {
      if (current === request) clear();
    }
  }
  function interrupt() { if (current) clear(); }
  window.addEventListener('wheel', interrupt, { passive: true });
  window.addEventListener('touchstart', interrupt, { passive: true });
  window.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) interrupt();
  });
  reduced.addEventListener('change', interrupt);
  document.addEventListener('astro:before-preparation', interrupt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); });
  return { go, get active() { return Boolean(current); } };
}
