import {createMechanismScrubber,nativeMechanismProgress} from './mechanism-motion.js';
import {createJourneyTransition,createJourneyPacer} from './journey-transition.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const compact = window.matchMedia('(max-width: 620px)');
const compactStage = window.matchMedia('(max-width: 1100px)');
const phoneHero = window.matchMedia('(max-width: 760px)');
const shortStage = window.matchMedia('(min-width: 1101px) and (max-height: 759px)');
// Stage queries match SelectedWork and ProjectJourney; compact selects portrait films.
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
// A position, rather than a queued animation: the same scroll coordinate always
// produces the same artwork, including when crossing a boundary in reverse.
function continuousJourneyState(progress, count = 3) {
  const p = clamp(progress);
  const half = .04;
  const index = Math.min(count - 1, Math.floor(p * count));
  const locals = Array.from({ length: count }, (_, i) => {
    const start = i === 0 ? 0 : i / count + half;
    const end = i === count - 1 ? 1 : (i + 1) / count - half;
    return clamp((p - start) / (end - start));
  });
  for (let from = 0; from < count - 1; from++) {
    const center = (from + 1) / count;
    if (p < center - half || p > center + half) continue;
    const t = clamp((p - center + half) / (half * 2));
    const eased = t * t * t * (t * (t * 6 - 15) + 10);
    return { index, locals, boundary: { from, to: from + 1, progress: t, eased },
      layers: [{ index: from, x: -100 * eased }, { index: from + 1, x: 100 * (1 - eased) }] };
  }
  return { index, locals, boundary: null, layers: [{ index, x: 0 }] };
}
const SEAT_MS = 160;
const PHASE_HASH = { 'project-matcher': 'matcher', 'project-vehicle': 'vehicle', 'project-robot': 'robot' };
let cleanup = () => {};

function containedMatcherRect(rect, aspect = 4 / 3) {
  const width = Math.min(rect.width, rect.height * aspect);
  const height = width / aspect;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
}
function heroMatcherPose(source, target, progress) {
  const t = 1 - Math.pow(1 - clamp(progress), 3);
  return Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, source[key] + (target[key] - source[key]) * t]));
}
// Carry the actual exhibit surface through the hero; never swap in a clone.
function createHeroMatcherHandoff({ root, track, stage, signal, requestPaint }) {
  const hero = document.querySelector('[data-workshop-hero]');
  const source = hero?.querySelector('.workshop-scene img');
  const model = root.querySelector('[data-matcher-model]');
  const visual = root.querySelector('[data-matcher-visual]');
  const poster = root.querySelector('[data-matcher-render]');
  const exhibit = root.querySelector('[data-matcher-exhibit]');
  if (!hero || !source || !model || !visual || !exhibit) return null;
  root.dataset.sharedHeroSurface = 'true';
  const home = model.parentNode;
  const following = model.nextSibling;
  const layer = document.createElement('div');
  layer.className = 'hero-matcher-handoff';
  layer.setAttribute('aria-hidden', 'true');
  layer.hidden = true;
  document.addEventListener('portfolio:matcher-render-ready', requestPaint, { signal });
  poster?.addEventListener('load', requestPaint, { signal });
  document.body.append(layer);
  let disposed = false, previousScroll = window.scrollY;
  const reset = (stageOwnsSurface = false) => {
    if (model.parentNode === layer) home.insertBefore(model, following?.parentNode === home ? following : null);
    layer.hidden = true;
    layer.style.willChange = '';
    if (stageOwnsSurface) hero.classList.add('is-handoff-source');
    else hero.classList.remove('is-handoff-source');
    root.classList.remove('is-hero-handoff');
  };
  const paint = () => {
    if (disposed) return;
    const pin = parseFloat(getComputedStyle(stage).top) || 0;
    const outside = stage.getBoundingClientRect().bottom <= pin;
    const end = track.getBoundingClientRect().top + window.scrollY - pin;
    const progress = end > 0 ? window.scrollY / end : 1;
    const scrollingUp = window.scrollY < previousScroll;
    previousScroll = window.scrollY;
    document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress', {
      detail: { distance: window.scrollY - end, scrollingUp, scroll: window.scrollY }
    }));
    const otherChapter = progress >= 1 && root.dataset.activeChapter && root.dataset.activeChapter !== 'matcher';
    const travelling = root.dataset.matcherTravel === 'true';
    const sharedMode = exhibit.dataset.mode === 'machine' || exhibit.dataset.heroReturning === 'true';
    if (outside || document.hidden || travelling || otherChapter || exhibit.dataset.surfaceReady !== 'true' || !sharedMode || !source.complete ||
        (exhibit.dataset.renderer !== 'film' && exhibit.dataset.renderer !== 'poster' && poster && (!poster.complete || !poster.naturalWidth))) {
      // Releasing the carried canvas does not release ownership to the hero
      // picture. Inside/Tune already occupy the visible stage aperture.
      reset(!outside && !document.hidden && progress > 0 && !otherChapter && exhibit.dataset.surfaceReady === 'true' &&
        (travelling || exhibit.dataset.mode !== 'machine'));
      return;
    }
    const from = containedMatcherRect(source.getBoundingClientRect());
    from.top += window.scrollY;
    // Measure the permanent aperture, which stays behind when the model moves.
    const rect = visual.getBoundingClientRect();
    const aperture = root.querySelector('.matcher-aperture');
    const lift = !aperture || getComputedStyle(aperture).position !== 'fixed'
      ? Math.max(0, stage.getBoundingClientRect().top - pin) : 0;
    const to = containedMatcherRect({ left: rect.left + rect.width * .08,
      top: rect.top - lift + rect.height * .12, width: rect.width * .84, height: rect.height * .84 });
    if (!from.width || !to.width) { reset(); return; }
    const pose = heroMatcherPose(from, to, progress);
    if (model.parentNode !== layer) layer.append(model);
    layer.style.transform = `translate3d(${pose.left.toFixed(3)}px,${pose.top.toFixed(3)}px,0) scale(${(pose.width / 1920).toFixed(6)})`;
    layer.style.willChange = 'transform';
    layer.hidden = false;
    hero.classList.add('is-handoff-source');
    root.classList.add('is-hero-handoff');
  };
  return { paint, reset, destroy() {
    disposed = true; reset(); layer.remove();
    delete root.dataset.sharedHeroSurface;
    document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress', { detail: { inactive: true } }));
  } };
}


// On phones the hero and exhibit share a single ordinary-flow aperture.
// Scrolling changes its surface; no fixed copy or reserved travel lane.
function createNativeHeroFlow({ root, signal, requestPaint }) {
  const model = root.querySelector('[data-matcher-model]');
  if (!model) return null;
  // A late CAD/portrait decode must remeasure the current first-pass position
  // even when the user has stopped scrolling while it was loading.
  document.addEventListener('portfolio:matcher-render-ready', requestPaint, { signal });
  let disposed = false, previousScroll = window.scrollY;
  const reset = () => { previousScroll = window.scrollY; };
  return { reset, paint() {
    if (disposed || document.hidden || root.dataset.motionPaused === 'true') return;
    const top = model.getBoundingClientRect().top + window.scrollY;
    const start = Math.max(0, top - window.innerHeight * .75);
    document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress', {
      detail: { nativeFlow: true, distance: window.scrollY - start, seatStart: start,
        scroll: window.scrollY, previousScroll, scrollingUp: window.scrollY < previousScroll }
    }));
    previousScroll = window.scrollY;
  }, destroy() {
    disposed = true;
    document.dispatchEvent(new CustomEvent('portfolio:hero-matcher-progress', { detail: { inactive: true } }));
  } };
}

// The opening copy makes one decisive handoff. Its opacity is time-based so
// stopping midway through a scroll never leaves two faint paragraphs to read.
function createHeroCopyHandoff({ root, track, stage, requestPaint }) {
  const hero = document.querySelector('[data-workshop-hero]');
  const source = hero?.querySelector('.workshop-hero-copy');
  const panel = root.querySelector('.matcher-panel');
  const evidence = root.querySelector('.matcher-evidence');
  const caption = root.querySelector('[data-matcher-caption]');
  if (!source || !panel) return null;
  const outgoing = [...source.querySelectorAll('h1, .workshop-hero-intro'), hero.querySelector('.workshop-hero-foot')].filter(Boolean);
  const incoming = [panel, evidence, caption].filter(Boolean);
  const all = [...outgoing, ...incoming];
  let active = false, disposed = false, shown = null, dimensions = '', generation = 0;
  let animations = [];
  const cancel = () => {
    generation++;
    // Freeze the displayed opacity before cancellation, so reversals start here.
    const opacities = all.map(node => getComputedStyle(node).opacity || '1');
    animations.forEach(animation => animation.cancel());
    animations = [];
    all.forEach((node, index) => { node.style.opacity = opacities[index]; });
  };
  const access = (matcher) => {
    source.inert = matcher;
    outgoing.forEach(node => { node.inert = matcher; });
    incoming.forEach(node => { node.inert = !matcher; });
  };
  const settle = (matcher) => {
    cancel();
    outgoing.forEach(node => { node.style.opacity = matcher ? '0' : '1'; });
    incoming.forEach(node => { node.style.opacity = matcher ? '1' : '0'; });
    access(matcher);
    shown = matcher;
  };
  const transition = (matcher) => {
    cancel();
    const token = generation;
    const leaving = matcher ? outgoing : incoming;
    const arriving = matcher ? incoming : outgoing;
    access(matcher);
    shown = matcher;
    const animate = (node, opacity, duration, delay) => {
      if (typeof node.animate !== 'function') { node.style.opacity = String(opacity); return; }
      const animation = node.animate(
        [{ opacity: Number(node.style.opacity) }, { opacity }],
        { duration, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }
      );
      animations.push(animation);
      animation.finished.then(() => {
        if (disposed || generation !== token) return;
        node.style.opacity = String(opacity);
        animation.cancel();
      }, () => {});
    };
    leaving.forEach(node => animate(node, 0, 110, 0));
    arriving.forEach(node => animate(node, 1, 180, 110));
  };
  const reset = () => {
    cancel();
    all.forEach(node => {
      node.style.opacity = '';
      ['--hero-copy-top', '--hero-copy-left', '--hero-copy-width', '--handoff-top', '--handoff-left', '--handoff-width'].forEach(key => node.style.removeProperty(key));
      node.inert = false;
    });
    source.inert = false;
    hero.classList.remove('is-copy-handoff');
    root.classList.remove('is-copy-handoff');
    active = false; shown = null; dimensions = '';
  };
  const paint = () => {
    if (disposed) return;
    const pin = parseFloat(getComputedStyle(stage).top) || 0;
    const distance = track.getBoundingClientRect().top + window.scrollY - pin;
    const progress = distance > 0 ? clamp(window.scrollY / distance) : 1;
    root.style.setProperty('--hero-aperture-visibility', progress > 0 && stage.getBoundingClientRect().bottom > pin ? 'visible' : 'hidden');
    // The chapter rail is pinned to the stage. Show it only after that stage
    // sticks, so it fades in place instead of sliding up with the page.
    const rail=root.querySelector('.journey-chapters');
    const railReady=!document.hidden&&progress>=1&&stage.getBoundingClientRect().bottom>=window.innerHeight-.5;
    if(rail)rail.inert=!railReady;
    if (railReady) root.classList.add('is-chapters-ready');
    else root.classList.remove('is-chapters-ready');
    // Keep the copy in screen coordinates through the seated stage as well.
    // Switching fixed/native positioning here lets the compositor move the
    // whole text column before the next scroll paint catches the unpinning.
    if (document.hidden) { if (active) reset(); return; }
    const size = `${window.innerWidth}:${window.innerHeight}`;
    if (!active || dimensions !== size) {
      hero.classList.remove('is-copy-handoff');
      root.classList.remove('is-copy-handoff');
      outgoing.forEach(node => {
        const rect = node.getBoundingClientRect();
        node.style.setProperty('--hero-copy-top', `${rect.top + window.scrollY}px`);
        node.style.setProperty('--hero-copy-left', `${rect.left}px`);
        node.style.setProperty('--hero-copy-width', `${rect.width}px`);
      });
      // Pin the incoming copy once. A scroll-linked counter-shift is a frame
      // behind the compositor and reads as vertical jitter the whole approach.
      const lift = Math.max(0, stage.getBoundingClientRect().top - pin);
      incoming.forEach(node => {
        const rect = node.getBoundingClientRect();
        const computed = getComputedStyle(node);
        const marginTop = parseFloat(computed.marginTop) || 0;
        const marginLeft = parseFloat(computed.marginLeft) || 0;
        node.style.setProperty('--handoff-top', `${rect.top - lift - marginTop}px`);
        node.style.setProperty('--handoff-left', `${rect.left - marginLeft}px`);
        node.style.setProperty('--handoff-width', `${rect.width}px`);
      });
      dimensions = size;
    }
    hero.classList.add('is-copy-handoff');
    root.classList.add('is-copy-handoff');
    const matcher = progress >= .22;
    if (!active || progress === 0) settle(matcher);
    else if (shown !== matcher) transition(matcher);
    active = true;
  };
  // Mode controls and fonts can become ready after the first measurement.
  // Re-seat from the complete native grid before the copy becomes visible.
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
    dimensions='';requestPaint?.();
  }):null;
  observer?.observe(panel);
  return { paint, reset, destroy() { disposed = true; observer?.disconnect();reset(); } };
}

function journeyFilmExtension() {
  const probe = document.createElement('video');
  const apple = typeof navigator !== 'undefined' && /Apple/.test(navigator.vendor || '');
  const hevc = probe.canPlayType('video/mp4; codecs="hvc1"');
  const vp9 = probe.canPlayType('video/webm; codecs="vp9"');
  // Safari 17.4+ reports VP9 as playable, but it drops the alpha plane to black.
  // HEVC-with-alpha .mov is the transparent path on Apple WebKit, including iPhone.
  return hevc && (apple || !vp9) ? '.mov' : '.webm';
}

function initJourney() {
  cleanup();
  const root = document.querySelector('[data-journey]');
  if (!root) return;
  // Live updates can leave a layer owned by an older module instance behind.
  // Restore its model before removing it; no prior still overlay may survive.
  document.querySelectorAll?.('.hero-matcher-handoff').forEach(layer => {
    const carried = layer.querySelector('[data-matcher-model]');
    const visual = root.querySelector('[data-matcher-visual]');
    if (carried && visual) visual.append(carried);
    layer.remove();
  });
  const abort = new AbortController();
  const { signal } = abort;
  const introEnd = Math.max(0, Math.min(.5, Number(root.dataset.introEnd ?? .26)));
  const continuous = root.dataset.continuousJourney !== undefined;
  const buttons = [...root.querySelectorAll('[data-scene]')];
  const trackNode = root.querySelector('.project-journey-track');
  if (!trackNode) return;
  const chapterNodes = [...trackNode.querySelectorAll('[data-journey-chapter]')];
  if (!chapterNodes.length) return;
  const track = {
    node: trackNode,
    stage: trackNode.querySelector('.project-journey-stage'),
    intro: trackNode.querySelector('.journey-intro'),
    introStill: trackNode.querySelector('.journey-intro-still'),
    introLoop: trackNode.querySelector('[data-intro-loop]'),
    rail: trackNode.querySelector('.journey-chapters'),
    poster: trackNode.querySelector('[data-journey-poster]'),
    videos: [...trackNode.querySelectorAll('[data-journey-video]')],
    generation: 0,
    activeMedia: '',
    handoffs: [],
    films: [...trackNode.querySelectorAll('[data-journey-film]')],
    matcherPlane: trackNode.querySelector('[data-matcher-plane]'),
    indicator: trackNode.querySelector('[data-journey-indicator]'),
  };
  if (!track.stage) return;
  const phases = chapterNodes.map((node) => ({
    node,
    id: node.dataset.journeyChapter,
    side: node.dataset.textSide || (node.dataset.journeyChapter === 'vehicle' ? 'right' : 'left'),
    still: node.querySelector('.project-journey-still'),
    loop: node.querySelector('[data-journey-loop]'),
  })).filter((phase) => phase.id);
  if (!phases.length) return;
  let raf = 0, near = true, lastPhaseId = '', introRestWatch = null, hudResting = true, restTimer = 0, seatTimer = 0;
  const documentFlow = reduced.matches || compactStage.matches || shortStage.matches;
  const staticMode = reduced.matches;
  const motionButton = root.querySelector('[data-journey-motion]');
  let motionPaused = root.dataset.motionPaused === 'true';
  if (motionButton) {
    motionButton.hidden = !documentFlow || staticMode;
    motionButton.textContent = motionPaused ? 'Play model motion' : 'Pause model motion';
    motionButton.setAttribute('aria-pressed', String(motionPaused));
    motionButton.addEventListener('click', () => {
      motionPaused = !motionPaused;
      root.dataset.motionPaused = String(motionPaused);
      motionButton.textContent = motionPaused ? 'Play model motion' : 'Pause model motion';
      motionButton.setAttribute('aria-pressed', String(motionPaused));
      paint();
    }, { signal });
  }
  root.classList.toggle('is-static', documentFlow);
  const flowHandoff = documentFlow && !staticMode && phoneHero.matches && root.dataset.heroHandoff !== undefined;
  if (flowHandoff) root.dataset.heroFlow = 'true';
  else delete root.dataset.heroFlow;
  const heroHandoff = flowHandoff ? createNativeHeroFlow({ root, signal, requestPaint: sync }) : !documentFlow && root.dataset.heroHandoff !== undefined
    ? createHeroMatcherHandoff({ root, track: track.node, stage: track.stage, signal, requestPaint: sync }) : null;
  const heroCopyHandoff = !documentFlow && root.dataset.heroHandoff !== undefined
    ? createHeroCopyHandoff({ root, track: track.node, stage: track.stage, requestPaint: () => sync() }) : null;
  if (!continuous) root.classList.add('is-enhanced');
  const variant = () => compact.matches ? 'portrait' : 'landscape';
  const asset = (id, extension) => `/assets/stories/moments/${id === 'vehicle' || id === 'robot' ? 'catalogue/' : ''}${id}-${variant()}${extension}`;
  const codec = journeyFilmExtension();
  const mechanismScrubbers = new Map();
  const mechanismCompleted = new Set();
  if(continuous) [...track.videos,...phases.map(phase=>phase.loop).filter(Boolean)].forEach(video=>{
    const phase=phases.find(phase=>phase.loop===video);
    const id=phase?.id||video.dataset.filmId||video.closest('[data-journey-film]')?.dataset.journeyFilm;
    const playbackRate=id==='vehicle'||id==='robot'?1.5:0;
    mechanismScrubbers.set(video,createMechanismScrubber(video,{signal,playbackRate,onFrame:()=>{
      if(phase)phase.still?.classList.add('has-loop');
      else video.closest('[data-journey-film]')?.classList.add('has-video');
      const complete=Boolean(mechanismScrubbers.get(video)?.complete),wasComplete=mechanismCompleted.has(video);
      if(complete){
        mechanismCompleted.add(video);
      }else mechanismCompleted.delete(video);
      if(scrollGoal&&complete!==wasComplete)sync();
    }}));
  });

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
    video._cancelLoad?.();
    const token = {};
    video._loadToken = token;
    video.dataset.source = src;
    video.dataset.ready = '';
    video.dataset.failed = '';
    video.dataset.chapter = id;
    video._loading = new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', failed); signal.removeEventListener('abort', done); resolve(); };
      const current = () => !signal.aborted && video._loadToken === token && video.dataset.source === src;
      const ready = () => { if (current()) video.dataset.ready = '1'; done(); };
      const failed = () => { if (current()) video.dataset.failed = '1'; done(); };
      video._cancelLoad = done;
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('error', failed, { once: true });
      timer = setTimeout(failed, 12000);
      video.preload = 'auto'; video.src = src; video.load();
      signal.addEventListener('abort', done, { once: true });
    });
    return video._loading;
  }
  track.videos.forEach(video => video.addEventListener('seeked', () => {
    if(continuous)return;
    const wanted = Number(video.dataset.wantedTime);
    if (Number.isFinite(wanted) && Math.abs(video.currentTime - wanted) > 1 / 35) video.currentTime = wanted;
  }, { signal }));

  function clearOptics(node) {
    if (!node) return;
    node.style.transform = '';
    node.style.opacity = '';
    node.style.clipPath = '';
    node.style.willChange = '';
  }
  function cancelHandoff() {
    track.handoffs.splice(0).forEach((animation) => { try { animation.cancel(); } catch {} });
    track.videos.forEach(clearOptics);
    clearOptics(track.poster);
  }
  function opticsOk() { return !documentFlow && !document.hidden && !reduced.matches; }
  function rackFromLeft(side, direction) {
    return direction === 'reverse';
  }
  function runOptics(incoming, outgoing, direction, posterOnly = false) {
    cancelHandoff();
    if (!opticsOk() || !incoming) return;
    const fromLeft = rackFromLeft(root.dataset.textSide || track.node.dataset.textSide, direction);
    const shift = fromLeft ? -110 : 110;
    const duration = Number(root.dataset.handoffDuration || 280);
    const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
    const play = (node, keyframes) => {
      if (!node?.animate) return;
      node.style.willChange = 'transform';
      const animation = node.animate(keyframes, { duration, easing, fill: 'forwards' });
      Promise.resolve(animation.finished).catch(() => {}).finally(() => { if (node.style.willChange) node.style.willChange = ''; });
      track.handoffs.push(animation);
    };
    play(incoming, [
      { opacity: 1, transform: `translate3d(${shift}%,0,0)` },
      { opacity: 1, transform: 'none' }
    ]);
    if (!posterOnly && outgoing && outgoing !== incoming) {
      play(outgoing, [
        { opacity: 1, transform: 'none' },
        { opacity: 1, transform: `translate3d(${-shift}%,0,0)` }
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
    if (continuous) {
      const motion = continuousJourneyState(story, count);
      const phase = phases[motion.index];
      return { isIntro: false, story, ...motion, local: motion.locals[motion.index], id: phase.id, side: phase.side, phase };
    }
    const scaled = story * count;
    const index = Math.min(count - 1, Math.max(0, Math.floor(scaled + 1e-6)));
    const local = clamp(scaled - index);
    const phase = phases[index];
    return { isIntro, story, index, local, id: phase.id, side: phase.side, phase };
  }
  let railGeometry = null;
  function paintIndicator(state) {
    if (!track.indicator || !track.rail) return;
    if (!railGeometry) {
      const rail = track.rail.getBoundingClientRect();
      railGeometry = buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { x: rect.left - rail.left, y: rect.bottom - rail.bottom, width: rect.width };
      });
    }
    const a = railGeometry[state.boundary?.from ?? state.index];
    const b = railGeometry[state.boundary?.to ?? state.index];
    if (!a || !b) return;
    const t = state.boundary?.eased ?? 0;
    track.indicator.style.transform = `translate3d(${a.x + (b.x - a.x) * t}px,${a.y + (b.y - a.y) * t}px,0) scaleX(${a.width + (b.width - a.width) * t})`;
  }
  function revealContinuousFrame(video) {
    const scene = video.closest('[data-journey-film]');
    if (!scene || video._frameRequest || !video.dataset.ready || video.dataset.failed) return;
    const source = video.dataset.source;
    const reveal = () => {
      video._frameRequest = 0;
      if (!signal.aborted && source === video.dataset.source && video.readyState >= 2 && !video.seeking && !video.dataset.failed) scene.classList.add('has-video');
    };
    if (typeof video.requestVideoFrameCallback === 'function') video._frameRequest = video.requestVideoFrameCallback(reveal);
    else reveal();
  }
  if (continuous) track.videos.forEach(video => {
    video.addEventListener('loadeddata', () => revealContinuousFrame(video), { signal });
    video.addEventListener('seeked', () => revealContinuousFrame(video), { signal });
  });
  const projectTransition=createJourneyTransition({ready:index=>{
    const id=phases[index]?.id;
    if(id==='matcher'){
      const model=root.querySelector('[data-matcher-model]');
      const poster=model?.querySelector('[data-matcher-render]');
      return !model||model.dataset.surface==='canvas'||Boolean(poster?.complete&&poster.naturalWidth);
    }
    const scene=track.films.find(node=>node.dataset.journeyFilm===id);
    const poster=scene?.querySelector('[data-scene-poster]');
    const video=scene?.querySelector('[data-journey-video]');
    return !poster||Boolean(poster.complete&&poster.naturalWidth)||Boolean(video?.dataset.ready&&!video.dataset.failed);
  }});
  function filmFinished(video){
    if(!video||video.dataset.failed||motionPaused)return true;
    if(!video.dataset.ready)return false;
    return mechanismCompleted.has(video);
  }
  function chapterFinished(id,native=false){
    if(id==='matcher'){
      const exhibit=root.querySelector('[data-matcher-exhibit]');
      if(!exhibit||staticMode||motionPaused||(exhibit.dataset.mode&&exhibit.dataset.mode!=='machine')||
        exhibit.dataset.renderer==='fallback'||exhibit.dataset.renderer==='poster'||
        (navigator.connection?.saveData&&exhibit.dataset.renderer!=='film'))return true;
      return exhibit.dataset.assemblyComplete==='true';
    }
    const scene=track.films.find(node=>node.dataset.journeyFilm===id);
    const phase=phases.find(phase=>phase.id===id);
    const video=native?phase?.loop:scene?.querySelector('[data-journey-video]');
    return filmFinished(video);
  }
  document.addEventListener('portfolio:matcher-motion',sync,{signal});
  const scrollPacer=createJourneyPacer({count:phases.length,ready:index=>{
    return chapterFinished(phases[index]?.id);
  }});
  const nativeFinishRequests=new Set();
  let scrollGoal=null,skipPacing=Boolean(window.__portfolioExplicitHash||window.__portfolioScrollY||window.__portfolioRestoringScroll||location.hash),correctingScroll=false,correctedY=null,observedY=window.scrollY;
  function scrollRange(){
    const pin=parseFloat(getComputedStyle(track.stage).top)||0;
    const start=track.node.getBoundingClientRect().top+window.scrollY-pin;
    const travel=Math.max(1,track.node.offsetHeight-track.stage.offsetHeight);
    return {start,travel};
  }
  function pacedTarget(y,currentY=window.scrollY){
    const {start,travel}=scrollRange();
    const current=(currentY-start)/travel,requested=(y-start)/travel;
    if(!scrollGoal&&((current<0&&requested<0)||(current>1&&requested>1)))return y;
    const story=(requested-introEnd)/(1-introEnd);
    const limited=scrollPacer.limit(story);
    return start+(introEnd+limited*(1-introEnd))*travel;
  }
  function nativeTarget(y,currentY=window.scrollY){
    if(y<currentY){nativeFinishRequests.clear();delete root.dataset.finishMatcher;}
    if(staticMode||motionPaused||y<=currentY)return y;
    for(const phase of phases){
      if(chapterFinished(phase.id,true))continue;
      const aperture=phase.id==='matcher'?root.querySelector('.matcher-aperture'):phase.still;
      if(!aperture)continue;
      const rect=aperture.getBoundingClientRect();
      const top=rect.top+window.scrollY,height=rect.height||aperture.offsetHeight||0;
      if(!height||currentY>=top+height)continue;
      // Keep each action in view only until its real final pose is shown.
      // Discard overflow instead of replaying it into the rest of the page.
      const seat=Math.max(80,(window.innerHeight-height)/2);
      const limit=Math.max(currentY,top-seat);
      if(y<=limit)continue;
      nativeFinishRequests.add(phase.id);
      if(phase.id==='matcher')root.dataset.finishMatcher='true';
      return limit;
    }
    return y;
  }
  function queueScroll(y,accepted){
    const {start,travel}=scrollRange();
    // Only retain travel through the models. Gesture overflow must not be
    // replayed into the rest of the page when the final transition finishes.
    const target=Math.max(start,Math.min(start+travel,y));
    scrollGoal=Math.abs(target-accepted)>1
      ?{y:target,direction:Math.sign(y-accepted)}:null;
  }
  function movePage(y){
    correctingScroll=true;
    window.scrollTo({top:y,behavior:'instant'});
    correctedY=window.scrollY;observedY=window.scrollY;
    correctingScroll=false;
  }
  function cancelPacing(){scrollGoal=null;nativeFinishRequests.clear();delete root.dataset.finishMatcher;skipPacing=true;correctedY=null;}
  function paceWheel(event){
    if(!continuous||event.defaultPrevented||event.ctrlKey||!Number.isFinite(event.deltaY)||!event.deltaY)return;
    skipPacing=false;
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1);
    if(documentFlow){
      const y=window.scrollY+delta,accepted=nativeTarget(y);
      if(Math.abs(y-accepted)>.001){event.preventDefault();movePage(accepted);sync();}
      return;
    }
    const direction=Math.sign(delta),pending=scrollGoal;
    const y=(pending&&pending.direction===direction?pending.y:window.scrollY)+delta;
    const accepted=pacedTarget(y);
    if(Math.abs(y-accepted)>.001||pending){
      event.preventDefault();
      if(Math.abs(y-accepted)>.001)queueScroll(y,accepted);
      else scrollGoal=null;
      movePage(accepted);sync();
    }
  }
  function paceNativeScroll(){
    const previous=observedY;observedY=window.scrollY;
    if(!continuous||skipPacing||window.__portfolioRestoringScroll||correctingScroll||document.hidden)return;
    if(correctedY!==null&&Math.abs(window.scrollY-correctedY)<.001)return;
    correctedY=null;
    if(documentFlow){
      const accepted=nativeTarget(window.scrollY,previous);
      if(Math.abs(window.scrollY-accepted)>.001)movePage(accepted);
      return;
    }
    const y=window.scrollY,accepted=pacedTarget(y,previous);
    if(Math.abs(y-accepted)>.001){
      queueScroll(y,accepted);
      movePage(accepted);
    }else scrollGoal=null;
  }
  function continueScroll(){
    if(!scrollGoal||skipPacing)return;
    const goal=scrollGoal;
    const accepted=pacedTarget(goal.y);
    if(Math.abs(accepted-goal.y)<1)scrollGoal=null;
    if(Math.abs(accepted-window.scrollY)>1)movePage(accepted);
  }
  track.films.forEach(scene=>scene.querySelector('[data-scene-poster]')?.addEventListener('load',sync,{signal}));
  function presentContinuous(state) {
    const layers = state.layers;
    const layerFor = id => layers.find(layer => phases[layer.index].id === id);
    const matcher = layerFor('matcher');
    root.dataset.matcherTravel=String(Boolean(matcher&&Math.abs(matcher.x)>.001));
    if (track.matcherPlane) {
      const shift = matcher?.x ?? 100;
      if (track.matcherPlane._shift !== shift) {
        track.matcherPlane._shift = shift;
        track.matcherPlane.style.transform = `translate3d(${shift}%,0,0)`;
      }
      track.matcherPlane.style.willChange = state.boundary && matcher ? 'transform' : '';
    }
    for (const scene of track.films) {
      const id = scene.dataset.journeyFilm;
      const layer = layerFor(id);
      scene.classList.toggle('is-participating', Boolean(layer));
      scene.style.transform = `translate3d(${layer?.x ?? 100}%,0,0)`;
      scene.style.willChange = state.boundary && layer ? 'transform' : '';
      const video = scene.querySelector('[data-journey-video]');
      if (!video) continue;
      const index = phases.findIndex(phase => phase.id === id);
      // The two stable buffers are never reassigned to another project. Decode
      // the next chapter ahead of its entry; a slow load keeps its own poster.
      const wanted = Boolean(layer) || (index === state.index + 1 && state.local > .45);
      if (near && wanted && !document.hidden && video.dataset.source !== asset(id, codec)) {
        scene.classList.remove('has-video');
        load(video, id).then(() => { if (!signal.aborted) sync(); });
      }
      if (layer && video.dataset.ready) {
        mechanismScrubbers.get(video)?.setTarget(state.locals[index],near&&!document.hidden&&!reduced.matches&&!motionPaused,Boolean(window.__portfolioSectionNavigation||window.__portfolioRestoringScroll));
      }else mechanismScrubbers.get(video)?.pause();
    }
    paintIndicator(state);
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
      coverOrUnveil(selected);
      if (changing && root.dataset.matcherExhibitStage !== undefined) runOptics(selected, null, direction);
      return;
    }
    const outgoing = track.videos.find(v => v.classList.contains('is-front') && v !== selected);
    track.videos.forEach(v => v.classList.toggle('is-front', v === selected));
    if (track.poster) track.poster.src = asset(id, '-poster.webp');
    if (changing) {
      unveilFilm();
      runOptics(selected, outgoing, direction);
      return;
    }
    coverOrUnveil(selected);
  }
  function unveilFilm() {
    track.node.classList.add('has-video');
    root.classList.add('has-video');
  }
  function coverOrUnveil(video) {
    if (root.classList.contains('is-intro')) {
      track.node.classList.remove('has-video');
      root.classList.remove('has-video');
      return;
    }
    armFilmUnveil(video);
  }
  function armFilmUnveil(video) {
    if (root.classList.contains('has-video') || root.classList.contains('is-intro')) return;
    let settled = false;
    const unveil = () => {
      if (settled || signal.aborted || !video.classList.contains('is-front')) return;
      settled = true;
      unveilFilm();
    };
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => unveil());
    }
    const afterPaint = () => requestAnimationFrame(() => requestAnimationFrame(unveil));
    if (video.readyState >= 2) afterPaint();
    else video.addEventListener('loadeddata', afterPaint, { once: true });
  }
  function present(id, local) {
    if (!near || documentFlow) return;
    if (id === 'matcher' && root.dataset.matcherExhibitStage !== undefined) {
      // The authored exhibit owns matcher media; the two film buffers remain
      // available for the original vehicle/robot handoff.
      track.videos.forEach(video => video.pause());
      track.activeMedia = '';
      track.exhibitPhase = 'matcher';
      return;
    }
    const front = track.videos.find(v => v.classList.contains('is-front'));
    const idle = track.videos.find(v => v !== front);
    const selected = front && front.dataset.chapter === id ? front : (front && idle ? idle : track.videos[0]);
    if (!selected) return;
    const src = asset(id, codec);
    const previous = track.activeMedia;
    const shownId = track.exhibitPhase || front?.dataset.chapter || previous.match(/moments\/(\w+)-/)?.[1];
    const prevIndex = phases.findIndex((phase) => phase.id === shownId);
    const nextIndex = phases.findIndex((phase) => phase.id === id);
    const direction = shownId && nextIndex < prevIndex ? 'reverse' : 'forward';
    const changing = Boolean(shownId) && shownId !== id;
    if (root.dataset.matcherExhibitStage !== undefined) track.exhibitPhase = id;
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
    if (!continuous && root.dataset.matcherExhibitStage !== undefined) {
      document.dispatchEvent(new CustomEvent('portfolio:journey-progress', { detail: { id: state.id, local: state.local } }));
    }
    if (!continuous && (state.isIntro || state.id !== 'matcher') && root.classList.contains('is-tuning')) {
      const tuner = root.querySelector('[data-instrument-toggle]');
      if (tuner?.getAttribute('aria-expanded') === 'true') tuner.click();
    }
    const nowIntro = state.isIntro && !documentFlow;
    const leavingIntro = root.classList.contains('is-intro') && !nowIntro && !documentFlow && state.id === 'matcher';
    root.classList.toggle('is-intro', nowIntro);
    if (leavingIntro) root.classList.add('is-matcher-handoff');
    else if (nowIntro || state.id !== 'matcher') root.classList.remove('is-matcher-handoff');
    if (track.intro) track.intro.inert = !state.isIntro && !documentFlow && !staticMode;
    if (track.rail) track.rail.inert = state.isIntro && !documentFlow;
    root.dataset.activeChapter = state.id;
    root.dataset.textSide = state.side;
    track.node.dataset.textSide = state.side;
    track.node.style.setProperty('--chapter-progress', state.local.toFixed(4));
    root.style.setProperty('--portrait-lift', '0');
    root.style.setProperty('--matcher-enter', '1');
    track.node.style.setProperty('--scene-opacity', '1');
    phases.forEach((phase, index) => {
      const shown = documentFlow || (!state.isIntro && index === state.index);
      const participating = shown || Boolean(continuous && state.layers?.some(layer => layer.index === index));
      phase.node.classList.toggle('is-active', shown);
      if (continuous) phase.node.classList.toggle('is-participating', participating);
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
    if (continuous) {
      const locals = Object.fromEntries(phases.map((phase, i) => [phase.id, state.locals?.[i] ?? state.local]));
      document.dispatchEvent(new CustomEvent('portfolio:journey-progress', { detail: {
        id: state.id, local: state.local, overallProgress: state.story,
        boundary: state.boundary, locals,
        participants: documentFlow ? [state.id] : state.layers.map(layer => phases[layer.index].id),
      } }));
    }
  }
  function cancelLoopFrame(video) {
    const pending=video?._loopFrame;
    if(!pending)return;
    video._loopFrame=null;
    if(pending.id)video.cancelVideoFrameCallback?.(pending.id);
    video.removeEventListener('playing',pending.done);
    pending.resolve(false);
  }
  function whenLoopFrame(video) {
    if(video._loopFrame)return video._loopFrame.promise;
    const pending={id:0,resolve:null,done:null,promise:null};
    pending.promise=new Promise(resolve=>{pending.resolve=resolve;});
    pending.done=()=>{
      if(video._loopFrame!==pending)return;
      video._loopFrame=null;video.removeEventListener('playing',pending.done);
      pending.resolve(true);
    };
    video._loopFrame=pending;
    if(typeof video.requestVideoFrameCallback==='function')pending.id=video.requestVideoFrameCallback(pending.done);
    else{
      video.addEventListener('playing',pending.done,{once:true});
      if(!video.paused&&video.readyState>=2)pending.done();
    }
    return pending.promise;
  }
  function loopOnscreen(phase) {
    const node = phase.still || phase.node;
    const rect = node.getBoundingClientRect();
    const view = window.innerHeight || 0;
    return rect.bottom > 0 && rect.top < view + Math.min(140, view * .18);
  }
  function pauseLoop(phase, keepFrame = false) {
    const video = phase.loop;
    if (!video) return;
    video._loopPlayRequest=null;
    mechanismScrubbers.get(video)?.pause();
    cancelLoopFrame(video);
    video.pause();
    video.classList.remove('is-playing');
    if(!keepFrame)phase.still?.classList.remove('has-loop');
  }
  function stopIntroRest() {
    const video = track.introLoop;
    if (introRestWatch && video) {
      video.removeEventListener('timeupdate', introRestWatch);
      video.removeEventListener('ended', introRestWatch);
      video.removeEventListener('seeked', introRestWatch);
    }
    introRestWatch = null;
    if (video) video.loop = true;
  }
  function pauseIntroLoop(keepReveal = false) {
    const video = track.introLoop;
    stopIntroRest();
    if (!video) return;
    cancelLoopFrame(video);
    video.pause();
    video.classList.remove('is-playing');
    if (!keepReveal) track.introStill?.classList.remove('has-loop');
  }
  function restIntroLoop() {
    const video = track.introLoop;
    if (!video) return;
    if (video.currentTime <= 1 / 15) {
      video.pause();
      video.classList.remove('is-playing');
      if (video.dataset.ready && !video.dataset.failed && video.readyState >= 2) video.currentTime = 0;
      stopIntroRest();
      return;
    }
    if (introRestWatch) return;
    video.loop = false;
    const onTick = (event) => {
      if (introShouldPlay() || !introRestWatch) return;
      if (event?.type === 'ended' || video.ended || video.currentTime <= 1 / 15) {
        video.pause();
        video.classList.remove('is-playing');
        if (video.readyState >= 2) video.currentTime = 0;
        stopIntroRest();
      }
    };
    introRestWatch = onTick;
    video.addEventListener('timeupdate', onTick, { signal });
    video.addEventListener('ended', onTick, { signal });
    video.addEventListener('seeked', onTick, { signal });
    if (video.paused) Promise.resolve(video.play?.()).catch(() => {});
    video.classList.add('is-playing');
  }
  function introOnscreen() {
    const node = track.introStill;
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const view = window.innerHeight || 0;
    return rect.bottom > 0 && rect.top < view;
  }
  function introShouldPlay() {
    return compact.matches && !reduced.matches && !document.hidden && introOnscreen() && (window.scrollY || 0) > 8;
  }
  function startIntroLoop() {
    stopIntroRest();
    const video = track.introLoop;
    const still = track.introStill;
    if (!video || !still || !introShouldPlay()) return;
    const src = asset('matcher', codec);
    const reveal = () => {
      if (signal.aborted || !introShouldPlay()) return;
      if (video.dataset.failed || !video.dataset.ready) return;
      const show = () => {
        if (signal.aborted || !introShouldPlay() || video.paused || video.dataset.failed) return;
        video.classList.add('is-playing');
        still.classList.add('has-loop');
      };
      const play = video.play?.();
      Promise.resolve(play).then(() => whenLoopFrame(video)).then(show).catch(() => {});
    };
    if (video.dataset.source !== src) {
      load(video, 'matcher').then(reveal);
      return;
    }
    if (video.dataset.ready || video.dataset.failed) reveal();
  }
  function presentIntroLoop() {
    if (!compact.matches || reduced.matches || document.hidden) {
      pauseIntroLoop();
      return;
    }
    if (track.introLoop) load(track.introLoop, 'matcher');
    if (introShouldPlay()) startIntroLoop();
    else if (track.introStill?.classList.contains('has-loop')) restIntroLoop();
    else pauseIntroLoop();
  }
  function stopLoops({ reset = false } = {}) {
    mechanismScrubbers.forEach(scrubber=>scrubber.pause());
    phases.forEach(phase=>pauseLoop(phase,continuous&&!reset&&!reduced.matches));
    pauseIntroLoop();
  }
  function startLoop(phase) {
    if (phase.id === 'matcher' && root.dataset.matcherLoop === undefined) return;
    const video = phase.loop;
    if (!video) return;
    const id = phase.id;
    const src = asset(id, codec);
    video.loop = true;
    video.playbackRate = id === 'robot' ? .75 : 1;
    const reveal = () => {
      if (signal.aborted || document.hidden || reduced.matches || motionPaused || !loopOnscreen(phase)) return;
      if (video.dataset.failed || !video.dataset.ready) return;
      if(video._loopPlayRequest||(!video.paused&&phase.still?.classList.contains('has-loop')))return;
      const request={};video._loopPlayRequest=request;
      const current=()=>video._loopPlayRequest===request&&video.dataset.source===src&&!signal.aborted&&!document.hidden&&!reduced.matches&&!motionPaused&&loopOnscreen(phase);
      Promise.resolve(video.play?.()).then(()=>current()?whenLoopFrame(video):false).then(decoded=>{
        if(!decoded||!current()||video.dataset.failed)return;
        video.classList.add('is-playing');
        phase.still?.classList.add('has-loop');
      }).catch(()=>{}).finally(()=>{if(video._loopPlayRequest===request)video._loopPlayRequest=null;});
    };
    if (video.dataset.source !== src) {
      load(video, id).then(reveal);
      return;
    }
    if (video.dataset.ready || video.dataset.failed) reveal();
  }
  function presentLoops(focusId) {
    if ((!compact.matches && root.dataset.continuousLoops === undefined) || reduced.matches || document.hidden || motionPaused) {
      stopLoops();
      return;
    }
    const index = phases.findIndex((phase) => phase.id === focusId);
    [phases[index - 1], phases[index + 1]].forEach((neighbor) => {
      if (neighbor?.loop && (neighbor.id !== 'matcher' || root.dataset.matcherLoop !== undefined)) load(neighbor.loop, neighbor.id);
    });
    phases.forEach((phase) => {
      if (!phase.loop) return;
      if (phase.id === 'matcher' && root.dataset.matcherLoop === undefined) {
        pauseLoop(phase);
        return;
      }
      if(continuous){
        const video=phase.loop,rect=(phase.still||phase.node).getBoundingClientRect();
        if(video.dataset.source!==asset(phase.id,codec))load(video,phase.id).then(()=>{if(!signal.aborted)sync();});
        const onscreen=rect.bottom>0&&rect.top<window.innerHeight;
        const target=nativeFinishRequests.has(phase.id)?1:nativeMechanismProgress(rect,window.innerHeight);
        mechanismScrubbers.get(video)?.setTarget(target,onscreen&&!motionPaused&&!reduced.matches&&!document.hidden,Boolean(window.__portfolioSectionNavigation||window.__portfolioRestoringScroll));
        return;
      }
      if (loopOnscreen(phase)) startLoop(phase);
      else pauseLoop(phase,continuous);
    });
  }
  function paint(now=performance.now()) {
    // Fixed descendants escape the sticky stage's clipping. Their visibility
    // belongs to the actual viewport, even while a film/scene transition waits.
    const pin = parseFloat(getComputedStyle(track.stage).top) || 0;
    const outside = !documentFlow && track.stage.getBoundingClientRect().bottom <= pin;
    root.dataset.journeyOutside = String(outside);
    if (documentFlow) {
      const visible = phases.find((phase) => {
        const rect = phase.node.getBoundingClientRect();
        return rect.top < window.innerHeight * .55 && rect.bottom > 120;
      }) || phases[0];
      const index = phases.indexOf(visible);
      const local = continuous ? clamp((window.innerHeight * .75 - visible.node.getBoundingClientRect().top) / Math.max(1, visible.node.offsetHeight - window.innerHeight * .25)) : 1;
      const state = { isIntro: false, story: index / Math.max(1, phases.length - 1), index, local, id: visible.id, side: visible.side, phase: visible };
      applyPhase(state);
      if (continuous) paintIndicator(state);
      presentIntroLoop();
      presentLoops(visible.id);
      heroHandoff?.paint();
      return;
    }
    if(continuous)continueScroll();
    const progress = progressFor();
    const wanted = phaseAt(progress);
    // Prepare the latest destination even while its predecessor is being held.
    // A hidden lazy poster otherwise cannot become ready to enter the stage.
    if(continuous)for(const layer of wanted.layers){
      const id=phases[layer.index].id;
      const scene=track.films.find(node=>node.dataset.journeyFilm===id);
      const poster=scene?.querySelector('[data-scene-poster]');
      if(poster)poster.loading='eager';
      const video=scene?.querySelector('[data-journey-video]');
      if(near&&!document.hidden&&video&&video.dataset.source!==asset(id,codec))load(video,id).then(()=>{if(!signal.aborted)sync();});
    }
    if (window.__portfolioSectionNavigation || window.__portfolioRestoringScroll || outside) projectTransition.reset();
    const motion=continuous?projectTransition.sample(wanted,now):wanted;
    if(continuous)scrollPacer.observe(motion);
    const phase=phases[motion.index];
    const state={...motion,id:phase.id,side:phase.side,phase,local:motion.locals?.[motion.index]??motion.local};
    applyPhase(state);
    if (continuous) presentContinuous(state);
    else present(state.id, state.local);
    heroHandoff?.paint();
    heroCopyHandoff?.paint();
    if(continuous){
      const film=track.films.find(scene=>scene.dataset.journeyFilm===state.id)?.querySelector('[data-journey-video]');
      // Decode/load events wake a held chapter. Do not spin animation frames
      // while waiting for a film, or replace completion with a wall-clock cut.
      const waiting=state.id==='matcher'?!chapterFinished('matcher'):film&&!film.dataset.failed&&(!film.dataset.ready||film.seeking);
      if(projectTransition.running||(scrollGoal&&!waiting))sync();
    }
  }
  function tick(now) {
    raf = 0;
    paint(now);
  }
  function sync() {
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function noteScroll() {
    if (documentFlow) return;
    hudResting = false;
    root.classList.remove('is-hud-resting');
    clearTimeout(restTimer);
    restTimer = setTimeout(() => {
      hudResting = true;
      root.classList.add('is-hud-resting');
      paint();
    }, 80);
  }
  function seatChapter(id) {
    if (reduced.matches) return;
    const button = buttons.find((item) => item.dataset.scene === id);
    if (!button) return;
    buttons.forEach((item) => item.classList.remove('is-seating'));
    button.classList.add('is-seating');
    clearTimeout(seatTimer);
    seatTimer = setTimeout(() => {
      button.classList.remove('is-seating');
      seatTimer = 0;
    }, SEAT_MS);
  }
  let navigationOwned = false;
  function stopNavigation() {
    if (!navigationOwned) return;
    navigationOwned = false;
    window.scrollTo({ top: window.scrollY, behavior: 'instant' });
  }
  function jumpTo(id, { smooth = false } = {}) {
    cancelPacing();
    const next = phases.find((phase) => phase.id === id) || phases[0];
    const previous = root.dataset.activeChapter;
    if (previous && previous !== next.id) {
      const prevIndex = phases.findIndex((phase) => phase.id === previous);
      const nextIndex = phases.findIndex((phase) => phase.id === next.id);
      root.dataset.sceneDirection = nextIndex < prevIndex ? 'reverse' : 'forward';
      seatChapter(next.id);
    }
    if (documentFlow) {
      navigationOwned = smooth && continuous && !reduced.matches;
      next.node.scrollIntoView({ block: 'start', behavior: navigationOwned ? 'smooth' : 'instant' });
      paint();
      return;
    }
    const pin = parseFloat(getComputedStyle(track.stage).top) || 0;
    const index = phases.findIndex((phase) => phase.id === next.id);
    const start = introEnd + (index / phases.length) * (1 - introEnd);
    const seat = continuous ? index / phases.length + (index === 0 ? .025 : .065) : start + .018;
    const y = track.node.getBoundingClientRect().top + window.scrollY - pin + seat * (track.node.offsetHeight - track.stage.offsetHeight);
    navigationOwned = smooth && continuous && !reduced.matches;
    window.scrollTo({ top: y, behavior: navigationOwned ? 'smooth' : 'auto' });
    paint();
  }
  function applyHash() {
    if (window.__portfolioSectionNavigation) return;
    const id = PHASE_HASH[location.hash.slice(1)];
    if (id) jumpTo(id);
  }
  function applyJourneyHash(event) {
    const id = event.detail?.id;
    if (id && phases.some((phase) => phase.id === id)) jumpTo(id, { smooth: event.detail.smooth === true });
  }
  buttons.forEach(button => button.addEventListener('click', () => jumpTo(button.dataset.scene, { smooth: true }), { signal }));
  root.querySelector('[data-start-story]')?.addEventListener('click', () => jumpTo(phases[0].id), { signal });
  window.addEventListener('hashchange', applyHash, { signal });
  document.addEventListener('portfolio:journey-hash', applyJourneyHash, { signal });
  document.addEventListener('portfolio:section-navigation-start', () => { cancelPacing(); stopNavigation(); }, { signal });
  document.addEventListener('portfolio:section-navigation-settle', event => {
    cancelPacing(); stopNavigation(); scrollPacer.reset(); projectTransition.reset(); paint();
    event.detail?.ready?.(() => {
      if (staticMode || motionPaused || document.hidden) return true;
      const rect = track.stage.getBoundingClientRect();
      if (!documentFlow && (rect.bottom <= 0 || rect.top >= window.innerHeight)) return true;
      const videos = documentFlow ? phases.filter(phase => loopOnscreen(phase)).map(phase => phase.loop)
        : track.films.filter(scene => scene.classList.contains('is-participating')).map(scene => scene.querySelector('[data-journey-video]'));
      return videos.every(video => !video || video.dataset.failed || mechanismScrubbers.get(video)?.settled);
    });
  }, { signal });
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || event.button !== 0) return;
    if (window.__portfolioSectionNavigation) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    let url;
    try { url = new URL(link.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    cancelPacing();
    const id = PHASE_HASH[url.hash.slice(1)];
    if (id) jumpTo(id, { smooth: true });
  }, { signal });
  if (continuous) {
    window.addEventListener('wheel', stopNavigation, { passive: true, signal });
    if(!staticMode)window.addEventListener('wheel',paceWheel,{passive:false,signal});
    const resumePacing=()=>{skipPacing=false;stopNavigation();};
    window.addEventListener('touchstart', resumePacing, { passive: true, signal });
    window.addEventListener('pointerdown', resumePacing, { passive: true, signal });
    window.addEventListener('scrollend', () => { navigationOwned = false; }, { signal });
    window.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) stopNavigation();
      if(['Home','End'].includes(event.key))cancelPacing();
      else if(['ArrowDown','ArrowUp','PageDown','PageUp',' '].includes(event.key))skipPacing=false;
    }, { signal });
  }
  const observer = new IntersectionObserver(entries => {
    near = entries.some(entry => entry.isIntersecting);
    if (near) sync();
  }, { rootMargin: '50% 0px' });
  observer.observe(root);
  fetch('/assets/stories/moments/moments-timeline.json', { signal }).then(r => r.ok ? r.json() : null).then(() => {
    if (!signal.aborted) paint();
  }).catch(() => {});
  window.addEventListener('scroll', () => { paceNativeScroll();noteScroll();sync(); }, { passive: true, signal });
  if (heroHandoff) root.addEventListener('click', sync, { signal });
  window.addEventListener('resize', () => { scrollGoal=null;scrollPacer.reset();railGeometry = null; stopNavigation(); sync(); }, { passive: true, signal });
  compact.addEventListener('change', () => { track.activeMedia = ''; cancelHandoff(); initJourney(); }, { signal });
  compactStage.addEventListener('change', () => { track.activeMedia = ''; cancelHandoff(); initJourney(); }, { signal });
  phoneHero.addEventListener('change', () => { track.activeMedia = ''; cancelHandoff(); initJourney(); }, { signal });
  shortStage.addEventListener('change', () => { track.activeMedia = ''; cancelHandoff(); initJourney(); }, { signal });
  reduced.addEventListener('change', () => { cancelHandoff(); initJourney(); }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      scrollGoal=null;scrollPacer.reset();
      projectTransition.reset();
      heroHandoff?.reset();
      heroCopyHandoff?.reset();
      cancelHandoff();
      stopLoops();
      return;
    }
    sync();
  }, { signal });
  root.dataset.journeyLive = '1';
  root.classList.add('is-enhanced');
  if (documentFlow) paint();
  else { paint(); sync(); }
  if (PHASE_HASH[location.hash.slice(1)]) requestAnimationFrame(applyHash);
  cleanup = () => {
    scrollGoal=null;scrollPacer.reset();nativeFinishRequests.clear();delete root.dataset.finishMatcher;
    projectTransition.reset();
    delete root.dataset.matcherTravel;
    delete root.dataset.journeyOutside;
    heroHandoff?.destroy();
    heroCopyHandoff?.destroy();
    stopNavigation();
    abort.abort(); observer.disconnect(); cancelAnimationFrame(raf); clearTimeout(restTimer); clearTimeout(seatTimer);
    buttons.forEach((button) => button.classList.remove('is-seating'));
    cancelHandoff();
    if (continuous) {
      clearOptics(track.matcherPlane);
      track.films.forEach(scene => { clearOptics(scene); scene.classList.remove('is-participating', 'has-video'); });
      phases.forEach(phase => {
        phase.node.classList.remove('is-participating');
        phase.node.inert = false;
        phase.node.removeAttribute('aria-hidden');
      });
      root.classList.remove('is-enhanced');
    }
    root.classList.remove('has-video');
    delete root.dataset.sceneDirection;
    delete root.dataset.journeyLive;
    track.node.classList.remove('has-video');
    stopLoops({reset:true});
    if (track.introLoop) {
      const video = track.introLoop;
      delete video.dataset.source;
      delete video.dataset.ready;
      delete video.dataset.failed;
      video._loading = null;
      video.removeAttribute('src');
      video.load();
    }
    track.videos.forEach(v => { v._cancelLoad?.(); if (v._frameRequest) v.cancelVideoFrameCallback?.(v._frameRequest); v._frameRequest = 0; v.pause(); v.classList.remove('is-front'); delete v.dataset.source; delete v.dataset.ready; delete v.dataset.failed; delete v.dataset.wantedTime; v._loading = null; v.removeAttribute('src'); v.load(); });
    phases.forEach((phase) => {
      const video = phase.loop;
      if (!video) return;
      delete video.dataset.source;
      delete video.dataset.ready;
      delete video.dataset.failed;
      video._loading = null;
      video.removeAttribute('src');
      video.load();
    });
  };
}
function bootJourney() {
  const root = document.querySelector('[data-journey]');
  if (root?.dataset.journeyLive === '1') return;
  initJourney();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootJourney, { once: true }); else bootJourney();
document.addEventListener('astro:page-load', bootJourney);
document.addEventListener('astro:before-preparation', () => cleanup());
