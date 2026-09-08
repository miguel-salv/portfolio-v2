const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const compact = window.matchMedia('(max-width: 900px)');
const shortStage = window.matchMedia('(min-width: 901px) and (max-height: 700px)');
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const SCENE_EDGE = .035;
const PHASE_HASH = { 'project-matcher': 'matcher', 'project-vehicle': 'vehicle', 'project-robot': 'robot' };
let cleanup = () => {};

function initJourney() {
  cleanup();
  const root = document.querySelector('[data-journey]');
  if (!root) return;
  const abort = new AbortController();
  const { signal } = abort;
  const introEnd = .26;
  const buttons = [...root.querySelectorAll('[data-scene]')];
  const trackNode = root.querySelector('.project-journey-track');
  if (!trackNode) return;
  const chapterNodes = [...trackNode.querySelectorAll('[data-journey-chapter]')];
  if (!chapterNodes.length) return;
  const track = {
    node: trackNode,
    stage: trackNode.querySelector('.project-journey-stage'),
    intro: trackNode.querySelector('.journey-intro'),
    poster: trackNode.querySelector('[data-journey-poster]'),
    videos: [...trackNode.querySelectorAll('[data-journey-video]')],
    generation: 0,
    activeMedia: '',
    handoffs: [],
  };
  if (!track.stage) return;
  const phases = chapterNodes.map((node) => ({
    node,
    id: node.dataset.journeyChapter,
    side: node.dataset.textSide || (node.dataset.journeyChapter === 'vehicle' ? 'right' : 'left'),
    still: node.querySelector('.project-journey-still'),
  })).filter((phase) => phase.id);
  if (!phases.length) return;
  let raf = 0, near = true, lastPhaseId = '';
  const documentFlow = reduced.matches || compact.matches || shortStage.matches;
  const staticMode = reduced.matches;
  root.classList.toggle('is-static', documentFlow);
  root.classList.add('is-enhanced');
  const variant = () => compact.matches ? 'portrait' : 'landscape';
  const asset = (id, extension) => `/assets/stories/moments/${id}-${variant()}${extension}`;
  const codec = document.createElement('video').canPlayType('video/webm; codecs="vp9"') ? '.webm' : '.mov';

  function seek(video, local) {
    if (!Number.isFinite(video.duration) || video.readyState < 2) return;
    video.dataset.wantedTime = String(Math.min(video.duration - 1 / 30, local * video.duration));
    if (!video.seeking && Math.abs(video.currentTime - Number(video.dataset.wantedTime)) > 1 / 35) {
      video.currentTime = Number(video.dataset.wantedTime);
    }
  }
  function load(video, id) {
    const src = asset(id, codec);
    if (video.dataset.source === src) return video._loading || Promise.resolve();
    video.dataset.source = src;
    video.dataset.ready = '';
    video.dataset.failed = '';
    video.dataset.chapter = id;
    video._loading = new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', failed); resolve(); };
      const ready = () => { video.dataset.ready = '1'; done(); };
      const failed = () => { video.dataset.failed = '1'; done(); };
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('error', failed, { once: true });
      timer = setTimeout(failed, 12000);
      video.preload = 'auto'; video.src = src; video.load();
      signal.addEventListener('abort', done, { once: true });
    });
    return video._loading;
  }
  track.videos.forEach(video => video.addEventListener('seeked', () => {
    const wanted = Number(video.dataset.wantedTime);
    if (Number.isFinite(wanted) && Math.abs(video.currentTime - wanted) > 1 / 35) video.currentTime = wanted;
  }, { signal }));

  function cancelHandoff() {
    track.handoffs.splice(0).forEach((animation) => { try { animation.cancel(); } catch {} });
    track.videos.forEach((video) => { video.style.transform = ''; video.style.opacity = ''; });
    if (track.poster) { track.poster.style.transform = ''; track.poster.style.opacity = ''; }
  }
  function opticsOk() { return !documentFlow && !document.hidden && !reduced.matches; }
  function runOptics(incoming, outgoing, direction, posterOnly = false) {
    cancelHandoff();
    if (!opticsOk() || !incoming) return;
    const dir = direction === 'reverse' ? -1 : 1;
    const duration = 280;
    const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
    const play = (node, keyframes) => {
      if (!node?.animate) return;
      track.handoffs.push(node.animate(keyframes, { duration, easing, fill: 'forwards' }));
    };
    play(incoming, [
      { opacity: posterOnly ? 1 : 0, transform: `translate3d(${9 * dir}px,0,0) scale(1.012)` },
      { opacity: 1, transform: 'none' }
    ]);
    if (!posterOnly && outgoing && outgoing !== incoming) {
      play(outgoing, [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: `translate3d(${-5.5 * dir}px,0,0)` }
      ]);
    }
  }
  function progressFor() {
    const travel = Math.max(1, track.node.offsetHeight - track.stage.offsetHeight);
    const top = parseFloat(getComputedStyle(track.stage).top) || 0;
    return clamp((top - track.node.getBoundingClientRect().top) / travel);
  }
  function phaseAt(progress) {
    const isIntro = progress < introEnd * .8;
    const story = clamp((progress - introEnd) / (1 - introEnd));
    const count = phases.length;
    const scaled = story * count;
    const index = Math.min(count - 1, Math.max(0, Math.floor(scaled + 1e-6)));
    const local = clamp(scaled - index);
    const phase = phases[index];
    return { isIntro, story, index, local, id: phase.id, side: phase.side, phase };
  }
  function revealSelected(selected, id, local, changing, direction) {
    if (selected.dataset.failed) {
      track.videos.forEach(v => v.classList.remove('is-front'));
      if (track.poster) track.poster.src = asset(id, '-poster.webp');
      track.node.classList.remove('has-video');
      root.classList.remove('has-video');
      if (changing) runOptics(track.poster, null, direction, true);
      return;
    }
    if (!selected.dataset.ready) return;
    seek(selected, local);
    if (selected.classList.contains('is-front') && selected.dataset.chapter === id) {
      if (track.poster) track.poster.src = asset(id, '-poster.webp');
      return;
    }
    const outgoing = track.videos.find(v => v.classList.contains('is-front') && v !== selected);
    track.videos.forEach(v => v.classList.toggle('is-front', v === selected));
    track.node.classList.add('has-video');
    root.classList.add('has-video');
    if (track.poster) track.poster.src = asset(id, '-poster.webp');
    if (changing) runOptics(selected, outgoing, direction);
  }
  function present(id, local, changing) {
    if (!near || documentFlow) return;
    const front = track.videos.find(v => v.classList.contains('is-front'));
    const idle = track.videos.find(v => v !== front);
    const selected = front && front.dataset.chapter === id ? front : (front && idle ? idle : track.videos[0]);
    if (!selected) return;
    const src = asset(id, codec);
    const previous = track.activeMedia;
    const prevId = previous.match(/moments\/(\w+)-/)?.[1];
    const prevIndex = phases.findIndex((phase) => phase.id === prevId);
    const nextIndex = phases.findIndex((phase) => phase.id === id);
    const direction = previous && nextIndex < prevIndex ? 'reverse' : 'forward';
    if (track.activeMedia !== selected.dataset.source || selected.dataset.source !== src) {
      track.activeMedia = src;
      const token = ++track.generation;
      load(selected, id).then(() => {
        if (signal.aborted || token !== track.generation) return;
        revealSelected(selected, id, local, changing, direction);
      });
    } else if (selected.dataset.ready || selected.dataset.failed) {
      revealSelected(selected, id, local, changing, direction);
    }
    if (selected.dataset.ready) seek(selected, local);
    const next = phases[phases.findIndex((phase) => phase.id === id) + 1];
    if (next && local > .65 && selected.classList.contains('is-front')) {
      const spare = track.videos.find(v => v !== selected);
      if (spare) load(spare, next.id);
    }
  }
  function applyPhase(state) {
    if ((state.isIntro || state.id !== 'matcher') && root.classList.contains('is-tuning')) {
      const tuner = root.querySelector('[data-instrument-toggle]');
      if (tuner?.getAttribute('aria-expanded') === 'true') tuner.click();
    }
    root.classList.toggle('is-intro', state.isIntro && !documentFlow);
    if (track.intro) track.intro.inert = !state.isIntro && !documentFlow && !staticMode;
    root.dataset.activeChapter = state.id;
    root.dataset.textSide = state.side;
    track.node.dataset.textSide = state.side;
    track.node.style.setProperty('--chapter-progress', state.local.toFixed(4));
    const lastPhase = state.index === phases.length - 1;
    const fadeIn = documentFlow || state.isIntro ? 1 : Math.min(1, state.local / SCENE_EDGE);
    const fadeOut = documentFlow || state.isIntro || lastPhase ? 1 : Math.min(1, (1 - state.local) / SCENE_EDGE);
    track.node.style.setProperty('--scene-opacity', String(.45 + .55 * Math.min(fadeIn, fadeOut)));
    phases.forEach((phase, index) => {
      const shown = documentFlow || (!state.isIntro && index === state.index);
      phase.node.classList.toggle('is-active', shown);
      phase.node.inert = !shown;
      phase.node.setAttribute('aria-hidden', String(!shown));
    });
    buttons.forEach((button) => {
      const current = button.dataset.scene === state.id && !(state.isIntro && !documentFlow);
      if (current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    const focused = document.activeElement;
    if (focused?.closest?.('[inert]')) {
      const current = buttons.find((button) => button.dataset.scene === state.id);
      if (current && typeof current.focus === 'function') current.focus();
      else if (typeof focused.blur === 'function') focused.blur();
    }
    if (state.id !== lastPhaseId) {
      if (lastPhaseId && lastPhaseId !== state.id) {
        const prevIndex = phases.findIndex((phase) => phase.id === lastPhaseId);
        root.dataset.sceneDirection = state.index < prevIndex ? 'reverse' : 'forward';
      }
      lastPhaseId = state.id;
    }
  }
  function paint() {
    if (documentFlow) {
      const visible = phases.find((phase) => {
        const rect = phase.node.getBoundingClientRect();
        return rect.top < window.innerHeight * .55 && rect.bottom > 120;
      }) || phases[0];
      const index = phases.indexOf(visible);
      applyPhase({ isIntro: false, story: 1, index, local: 1, id: visible.id, side: visible.side, phase: visible });
      return;
    }
    const state = phaseAt(progressFor());
    applyPhase(state);
    present(state.id, state.local, true);
  }
  function tick() {
    paint();
    raf = 0;
  }
  function sync() {
    if (staticMode && !compact.matches && !shortStage.matches) return;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function jumpTo(id) {
    const next = phases.find((phase) => phase.id === id) || phases[0];
    const previous = root.dataset.activeChapter;
    if (previous && previous !== next.id) {
      const prevIndex = phases.findIndex((phase) => phase.id === previous);
      const nextIndex = phases.findIndex((phase) => phase.id === next.id);
      root.dataset.sceneDirection = nextIndex < prevIndex ? 'reverse' : 'forward';
    }
    if (documentFlow) {
      next.node.scrollIntoView({ block: 'start' });
      paint();
      return;
    }
    const pin = parseFloat(getComputedStyle(track.stage).top) || 0;
    const index = phases.findIndex((phase) => phase.id === next.id);
    const start = introEnd + (index / phases.length) * (1 - introEnd);
    const y = track.node.getBoundingClientRect().top + window.scrollY - pin + (start + .018) * (track.node.offsetHeight - track.stage.offsetHeight);
    window.scrollTo({ top: y, behavior: 'auto' });
    paint();
  }
  function applyHash() {
    const id = PHASE_HASH[location.hash.slice(1)];
    if (id) jumpTo(id);
  }
  function applyJourneyHash(event) {
    const id = event.detail?.id;
    if (id && phases.some((phase) => phase.id === id)) jumpTo(id);
  }
  buttons.forEach(button => button.addEventListener('click', () => jumpTo(button.dataset.scene), { signal }));
  root.querySelector('[data-start-story]')?.addEventListener('click', () => jumpTo(phases[0].id), { signal });
  window.addEventListener('hashchange', applyHash, { signal });
  document.addEventListener('portfolio:journey-hash', applyJourneyHash, { signal });
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    let url;
    try { url = new URL(link.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    const id = PHASE_HASH[url.hash.slice(1)];
    if (id) jumpTo(id);
  }, { signal });
  const observer = new IntersectionObserver(entries => {
    near = entries.some(entry => entry.isIntersecting);
    if (near) sync();
  }, { rootMargin: '50% 0px' });
  observer.observe(root);
  fetch('/assets/stories/moments/moments-timeline.json', { signal }).then(r => r.ok ? r.json() : null).then(() => {
    if (!signal.aborted) paint();
  }).catch(() => {});
  window.addEventListener('scroll', sync, { passive: true, signal });
  window.addEventListener('resize', sync, { passive: true, signal });
  compact.addEventListener('change', () => { track.activeMedia = ''; cancelHandoff(); initJourney(); }, { signal });
  shortStage.addEventListener('change', () => { track.activeMedia = ''; cancelHandoff(); initJourney(); }, { signal });
  reduced.addEventListener('change', () => { cancelHandoff(); initJourney(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHandoff(); }, { signal });
  if (documentFlow) paint();
  else { paint(); sync(); }
  if (PHASE_HASH[location.hash.slice(1)]) requestAnimationFrame(applyHash);
  cleanup = () => {
    abort.abort(); observer.disconnect(); cancelAnimationFrame(raf);
    cancelHandoff();
    root.classList.remove('has-video');
    delete root.dataset.sceneDirection;
    track.node.classList.remove('has-video');
    track.videos.forEach(v => { v.pause(); v.classList.remove('is-front'); delete v.dataset.source; delete v.dataset.ready; delete v.dataset.failed; delete v.dataset.wantedTime; v._loading = null; v.removeAttribute('src'); v.load(); });
  };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initJourney, { once: true }); else initJourney();
document.addEventListener('astro:page-load', initJourney);
document.addEventListener('astro:before-preparation', () => cleanup());
