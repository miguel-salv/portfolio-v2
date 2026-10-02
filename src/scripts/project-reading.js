let cleanupReading = () => {};

function initProjectReading() {
  cleanupReading();
  const index = document.querySelector('[data-project-index]');
  if (!index) return;
  const controller = new AbortController();
  const { signal } = controller;
  const links = [...index.querySelectorAll('[data-project-section-link]')];
  const sections = links.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
  const compact = matchMedia('(max-width: 900px)');
  let frame = 0;
  const configure = () => { index.open = !compact.matches; };
  const update = () => {
    frame = 0;
    const line = compact.matches ? 160 : 140;
    const active = sections.find(section => {
      const rect = section.getBoundingClientRect();
      return rect.top <= line && rect.bottom > line;
    });
    links.forEach(link => {
      if (active && link.hash === `#${active.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  compact.addEventListener('change', configure, { signal });
  index.addEventListener('click', event => {
    if (compact.matches && event.target.closest('[data-project-section-link]')) index.open = false;
  }, { signal });
  window.addEventListener('scroll', schedule, { signal, passive: true });
  window.addEventListener('resize', schedule, { signal, passive: true });
  configure();
  schedule();
  cleanupReading = () => { controller.abort(); cancelAnimationFrame(frame); };
}

document.addEventListener('astro:page-load', initProjectReading);
document.addEventListener('astro:before-preparation', () => cleanupReading());
