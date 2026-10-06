// A single marker belongs to the persistent header, including across route swaps.
export function activeHomeItem(sections, { height, scrollY, scrollHeight }) {
  const contact = sections.find(section => section.item === 'contact');
  if (scrollY > 0 && scrollY + height >= scrollHeight - 2 && contact?.top < height && contact.bottom > 0) return 'contact';
  const readingLine = height * .35;
  return sections.find(section => section.top <= readingLine && section.bottom > readingLine)?.item || null;
}

export function installHeaderSelection({ document, window }) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let header, nav, line, observer, resizeObserver;
  let frame = 0, navigating = false, sectionItem = null, lastTransform = '', placed = false, instantNext = false;

  function setCurrent(item, value = 'true') {
    nav?.querySelectorAll('a[data-nav-item]').forEach(link => {
      const current = link.dataset.navItem === item ? value : null;
      if (link.getAttribute('aria-current') === current) return;
      if (current) link.setAttribute('aria-current', current);
      else link.removeAttribute('aria-current');
    });
  }

  function paint() {
    frame = 0;
    const instant = instantNext;
    instantNext = false;
    if (!nav || document.hidden) return;
    if (sectionItem) setCurrent(sectionItem);
    else if (!navigating && !window.__portfolioRestoringScroll && header.dataset.variant === 'home' && !document.documentElement.classList.contains('hash-pending')) {
      // Both project groups select Projects; the terminal contact block must win
      // at the page bottom even when Career still crosses the reading line.
      const sections = [['selected-work', 'projects'], ['projects', 'projects'], ['about', 'about'], ['career', 'career'], ['contact', 'contact']]
        .flatMap(([id, item]) => {
          const section = document.getElementById(id);
          if (!section) return [];
          const { top, bottom } = section.getBoundingClientRect();
          return [{ item, top, bottom }];
        });
      setCurrent(activeHomeItem(sections, {
        height: window.innerHeight, scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight
      }));
    }
    const selected = nav.querySelector('a[aria-current] .nav-label');
    const parent = nav.getBoundingClientRect();
    if (!selected || nav.hidden || !parent.width) {
      line.classList.remove('is-placed');
      if (nav.classList.contains('has-header-selection')) nav.classList.remove('has-header-selection');
      placed = false;
      lastTransform = '';
      return;
    }
    const rect = selected.getBoundingClientRect();
    const transform = `translate(${(rect.left - parent.left + nav.scrollLeft).toFixed(2)}px, ${(rect.bottom - parent.top + nav.scrollTop + 3).toFixed(2)}px) scaleX(${rect.width.toFixed(2)})`;
    if (transform !== lastTransform) {
      line.classList.toggle('is-traveling', placed && !instant && !reduced.matches);
      line.style.transform = transform;
      lastTransform = transform;
    } else if (instant || reduced.matches) {
      line.classList.remove('is-traveling');
    }
    line.classList.add('is-placed');
    if (!nav.classList.contains('has-header-selection')) nav.classList.add('has-header-selection');
    placed = true;
  }

  function requestPaint(instant = false) {
    instantNext ||= instant;
    if (!frame && !document.hidden) frame = window.requestAnimationFrame(paint);
  }

  function bind() {
    const current = document.querySelector('.site-header');
    if (current === header) return;
    observer?.disconnect();
    resizeObserver?.disconnect();
    header = current;
    nav = header?.querySelector('#nav-links');
    line = nav?.querySelector('.header-selection');
    lastTransform = ''; placed = false;
    if (!line) { nav = null; return; }
    observer = new window.MutationObserver(entries => {
      if (entries.some(entry => entry.attributeName === 'aria-current' || entry.target === nav)) requestPaint();
    });
    observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'hidden', 'class'] });
    if (window.ResizeObserver) {
      resizeObserver = new window.ResizeObserver(() => requestPaint());
      resizeObserver.observe(nav);
    }
  }

  document.addEventListener('astro:before-preparation', () => { navigating = true; });
  document.addEventListener('astro:before-swap', event => {
    const destination = event.newDocument.querySelector('.site-header');
    if (!destination) return;
    const variant = destination.dataset.variant;
    const label = destination.querySelector('nav').getAttribute('aria-label');
    const links = [...destination.querySelectorAll('a[data-nav-item]')].map(link => ({
      item: link.dataset.navItem, href: link.getAttribute('href'), current: link.getAttribute('aria-current')
    }));
    const swap = event.swap;
    event.swap = () => {
      const previousBody = document.body;
      swap();
      // The navigation guard can cancel a stale swap. Never apply its destination
      // to the surviving page, or replace the marker while it is moving.
      if (document.body === previousBody) return;
      bind();
      if (!header) return;
      header.dataset.variant = variant;
      header.querySelector('nav').setAttribute('aria-label', label);
      links.forEach(({ item, href, current }) => {
        const link = nav.querySelector(`a[data-nav-item="${item}"]`);
        link.setAttribute('href', href);
        // Home selection comes from the restored viewport. Retain the previous
        // marker until that viewport is available, so it can travel from there.
        if (variant === 'home') return;
        if (current) link.setAttribute('aria-current', current);
        else link.removeAttribute('aria-current');
      });
      requestPaint();
    };
  });
  document.addEventListener('astro:page-load', () => {
    navigating = false;
    bind();
    requestPaint();
  });
  document.addEventListener('portfolio:scroll-restored', () => requestPaint());
  document.addEventListener('portfolio:section-navigation-start', event => { sectionItem = event.detail.item; requestPaint(); });
  document.addEventListener('portfolio:section-navigation-end', () => { sectionItem = null; requestPaint(); });
  window.addEventListener('scroll', () => requestPaint(), { passive: true });
  window.addEventListener('resize', () => requestPaint(true));
  reduced.addEventListener('change', () => requestPaint(true));
  document.addEventListener('visibilitychange', () => requestPaint(true));
  const rootObserver = new window.MutationObserver(() => requestPaint());
  rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  bind();
  paint();
  document.fonts?.ready.then(() => requestPaint(true));
}
