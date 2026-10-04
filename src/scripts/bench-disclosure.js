// Native details remain the no-script/reduced-motion behavior. Enhanced closing
// keeps the outgoing content until its height seats, then commits native state.
export function createDisclosure(details, { reduced, signal, onLayout = () => {} }) {
  const summary = details.querySelector('summary');
  if (!summary || !details.animate) return () => {};
  let animation = null, targetOpen = details.open, generation = 0;
  const settle = () => {
    ++generation;
    animation?.cancel(); animation = null;
    details.style.height = ''; details.style.overflow = '';
    details.open = targetOpen;
    summary.removeAttribute('aria-expanded');
    onLayout();
  };
  const click = event => {
    // Preserve links if additional evidence is ever included in the summary.
    if (event.target.closest?.('a')) return;
    if (reduced.matches || document.hidden) return;
    event.preventDefault();
    const from = details.getBoundingClientRect().height;
    targetOpen = !targetOpen;
    const token = ++generation;
    animation?.cancel();
    details.style.height = '';
    details.style.overflow = 'clip';
    details.open = true;
    const to = targetOpen ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height;
    summary.setAttribute('aria-expanded', String(targetOpen));
    animation = details.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: targetOpen ? 360 : 240, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'both'
    });
    animation.finished.then(() => { if (token === generation && !signal.aborted) settle(); }, () => {});
    onLayout();
  };
  summary.addEventListener('click', click, { signal });
  // Native keyboard activation still produces click. External native changes
  // update the destination whenever there is no animation in flight.
  details.addEventListener('toggle', () => { if (!animation) targetOpen = details.open; }, { signal });
  reduced.addEventListener('change', settle, { signal });
  document.addEventListener('visibilitychange', settle, { signal });
  window.addEventListener('resize', settle, { signal });
  return settle;
}
