const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const viewportQuery = window.matchMedia("(max-width: 900px)");
const prefersReducedMotion = () => motionQuery.matches;
const isCompactViewport = () => viewportQuery.matches;

const NEAR_MARGIN = "160% 0px";
const ON_MARGIN = "8% 0px";
const LERP = 0.16;
const FPS = 30;
const PRELOAD_AT = 0.62;
const MANIFEST_PATH = "/assets/stories/moments/moments-timeline.json";

let cleanupProjectJourney = () => {};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function activeTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function viewportVariant() {
  return isCompactViewport() ? "portrait" : "landscape";
}

function headerOffset() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--header-offset");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 57;
}

function progressThrough(track, stage) {
  const travel = Math.max(1, track.offsetHeight - stage.offsetHeight);
  return clamp((headerOffset() - track.getBoundingClientRect().top) / travel);
}

function readPair(node, mode) {
  const read = (key) => node.getAttribute(`data-${key}`) || "";
  const theme = activeTheme();
  if (mode === "fallback") {
    return { src: read(`fallback-${theme}`), poster: read(`fallback-poster-${theme}`) };
  }
  const variant = viewportVariant();
  return {
    src: read(`src-${variant}-${theme}`),
    poster: read(`poster-${variant}-${theme}`),
  };
}

function proofEndsFromShots(shots, proofCount) {
  const ends = (shots || [])
    .filter((shot) => shot && shot.id !== "card")
    .map((shot) => Number(shot.progress?.[1] ?? shot.end_progress))
    .filter((value) => Number.isFinite(value));
  if (ends.length) return ends;
  return Array.from({ length: Math.max(1, proofCount) }, (_, index) => (index + 1) / Math.max(1, proofCount + 1));
}

function activeProofIndex(local, ends) {
  if (!ends.length || local >= ends[ends.length - 1] - 0.0001) return -1;
  let index = 0;
  while (index < ends.length - 1 && local >= ends[index]) index += 1;
  return index;
}

function proofMix(local, ends, index) {
  const start = index === 0 ? 0 : ends[index - 1];
  const end = ends[index];
  if (!Number.isFinite(end)) return 0;
  const span = Math.max(0.0001, end - start);
  const fade = Math.min(0.07, span * 0.4);
  if (local <= start) return clamp((local - (start - fade)) / fade);
  if (local >= end) return clamp(1 - (local - end) / fade);
  return 1;
}

function chapterFromProgress(progress, chapters) {
  const total = chapters.reduce((sum, chapter) => sum + chapter.duration, 0) || 1;
  let start = 0;
  for (let index = 0; index < chapters.length; index += 1) {
    const span = chapters[index].duration / total;
    const end = index === chapters.length - 1 ? 1 : start + span;
    if (progress < end || index === chapters.length - 1) {
      return { index, local: span > 0 ? clamp((progress - start) / span) : 1 };
    }
    start = end;
  }
  const last = chapters.length - 1;
  return { index: last, local: 1 };
}

function frameProgress(duration) {
  return 1 / (FPS * Math.max(0.1, duration));
}

function lerp(start, end, amount) {
  return start + (end - start) * clamp(amount);
}

function driveShift(id, local) {
  if (id === "vehicle") {
    let travel;
    if (local < 0.27) travel = (local / 0.27) * 0.28;
    else if (local < 0.58) travel = 0.28 + ((local - 0.27) / 0.31) * 0.34;
    else travel = 0.62 + ((local - 0.58) / 0.42) * 0.38;
    return lerp(28, -36, travel);
  }
  if (id === "robot") {
    const travel = local < 0.7 ? (local / 0.7) * 0.35 : 0.35 + ((local - 0.7) / 0.3) * 0.65;
    return lerp(-4, 40, travel);
  }
  return 0;
}

function initProjectJourney() {
  cleanupProjectJourney();

  const root = document.querySelector("[data-journey]");
  if (!root) return;

  const track = root.querySelector(".project-journey-track") || root;
  const stage = root.querySelector(".project-journey-stage") || root;
  const poster = root.querySelector("[data-journey-poster]");
  const kicker = root.querySelector("[data-journey-kicker]");
  const road = root.querySelector("[data-journey-road]");
  const videos = [...root.querySelectorAll("[data-journey-video]")];
  const chapterNodes = [...root.querySelectorAll("[data-journey-chapter]")];
  const chapters = chapterNodes.map((node) => ({
    node,
    id: node.dataset.journeyChapter || "matcher",
    title: node.dataset.title || "",
    duration: Math.max(0.1, Number(node.dataset.duration) || 4),
    fps: FPS,
    proofs: [...node.querySelectorAll(".moment-proof")],
    still: node.querySelector("[data-journey-still]"),
    shotEnds: proofEndsFromShots(null, node.querySelectorAll(".moment-proof").length),
    mode: "moment",
  }));

  if (!chapters.length || videos.length < 1) return;

  const listener = new AbortController();
  const pendingSeeks = new WeakMap();
  const state = {
    target: 0,
    current: 0,
    near: false,
    onscreen: false,
    chapter: 0,
    pendingChapter: -1,
    swapGen: 0,
    front: 0,
    loaded: new Map(),
    swapping: false,
    running: false,
    raf: 0,
  };

  const stop = () => {
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    root.classList.remove("is-ticking");
  };

  const pair = (chapter) => readPair(chapter.node, chapter.mode);
  const totalDuration = () => chapters.reduce((sum, chapter) => sum + chapter.duration, 0) || 1;

  const applyPoster = (url, { paintVideos = true } = {}) => {
    const activeChapter = chapters[Math.max(0, state.chapter)] || chapters[0];
    const fallback = activeChapter ? readPair(activeChapter.node, "fallback").poster : "";
    const visible = url || fallback;
    if (poster && poster.getAttribute("src") !== visible) poster.src = visible;
    if (paintVideos) {
      videos.forEach((video) => {
        video.poster = visible;
      });
    }
    chapters.forEach((chapter) => {
      const stillSrc = readPair(chapter.node, chapter.mode).poster;
      if (chapter.still && stillSrc && chapter.still.getAttribute("src") !== stillSrc) chapter.still.src = stillSrc;
    });
  };

  const applyPinned = () => {
    const pinned = !prefersReducedMotion() && state.onscreen && state.current > 0.012 && state.current < 0.988;
    document.documentElement.classList.toggle("is-journey-pinned", pinned);
    root.classList.toggle("is-pinned", pinned);
  };

  const applyHud = (chapterIndex, local) => {
    const chapter = chapters[chapterIndex];
    if (!chapter) return;
    const proof = prefersReducedMotion() ? 0 : activeProofIndex(local, chapter.shotEnds);
    const lastEnd = chapter.shotEnds[chapter.shotEnds.length - 1] ?? 1;
    const driveLane = (chapter.id === "vehicle" || chapter.id === "robot") && !prefersReducedMotion();
    const clearing = !prefersReducedMotion() && !driveLane && local >= lastEnd - 0.0001;
    root.dataset.activeChapter = chapter.id;
    root.dataset.activeStep = String(proof);
    root.classList.toggle("is-clearing", clearing);
    root.style.setProperty("--journey-progress", state.current.toFixed(4));
    root.style.setProperty("--chapter-progress", local.toFixed(4));
    root.style.setProperty(
      "--drive-shift",
      prefersReducedMotion() ? "0" : driveShift(chapter.id, local).toFixed(3),
    );
    if (kicker && !clearing) kicker.textContent = chapter.title;
    if (road) road.textContent = "";
    chapters.forEach((entry, index) => {
      const current = prefersReducedMotion() || index === chapterIndex;
      entry.node.classList.toggle("is-active", current);
      entry.proofs.forEach((item, proofIndex) => {
        if (prefersReducedMotion() || (driveLane && index === chapterIndex)) {
          item.style.setProperty("--proof-mix", "1");
          item.classList.add("is-active");
          item.removeAttribute("aria-hidden");
          return;
        }
        const mix = index === chapterIndex ? proofMix(local, entry.shotEnds, proofIndex) : 0;
        item.style.setProperty("--proof-mix", mix.toFixed(3));
        const active = mix > 0.45;
        item.classList.toggle("is-active", active);
        item.toggleAttribute("aria-hidden", mix < 0.2);
      });
    });
  };

  const applyVideoTime = (video, local, duration, fps = FPS) => {
    if (!video || !duration || prefersReducedMotion()) return;
    const time = clamp(local) * duration;
    const eps = duration / (Math.max(1, fps) * Math.max(0.1, duration));
    if (Math.abs(video.currentTime - time) <= eps) return;

    const commit = (next) => {
      if (Math.abs(video.currentTime - next) <= eps) return;
      try {
        video.currentTime = next;
      } catch {
        /* currentTime can throw before the first frame is decodable */
      }
    };

    pendingSeeks.set(video, time);
    if (typeof video.requestVideoFrameCallback === "function") {
      commit(time);
      if (video.dataset.rvfc === "1") return;
      video.dataset.rvfc = "1";
      video.requestVideoFrameCallback(() => {
        video.dataset.rvfc = "";
        const next = pendingSeeks.get(video);
        pendingSeeks.delete(video);
        if (next == null) return;
        commit(next);
      });
      return;
    }
    commit(time);
  };

  const videoKey = (chapter, src) => `${chapter.id}:${src}`;

  const loadVideo = (video, chapter, { playhead = 0, silentPoster = false } = {}) => {
    const { src, poster: posterUrl } = pair(chapter);
    if (!src || prefersReducedMotion()) {
      applyPoster(posterUrl, { paintVideos: !silentPoster });
      return Promise.resolve();
    }
    applyPoster(posterUrl, { paintVideos: !silentPoster });
    const currentSrc = video.currentSrc || video.getAttribute("src") || "";
    if (currentSrc.endsWith(src) || currentSrc === src) {
      const ready = () => {
        const duration = Number(video.duration);
        if (Number.isFinite(duration) && duration > 0) {
          video.classList.add("is-ready");
          applyVideoTime(video, playhead, duration, chapter.fps);
        }
      };
      if (video.readyState >= 1) {
        ready();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        video.addEventListener("loadedmetadata", () => {
          ready();
          resolve();
        }, { once: true, signal: listener.signal });
      });
    }

    return new Promise((resolve) => {
      const key = videoKey(chapter, src);
      const loadGen = String((Number(video.dataset.loadGen) || 0) + 1);
      video.dataset.loadGen = loadGen;
      const finish = () => {
        if (video.dataset.loadGen !== loadGen) {
          resolve();
          return;
        }
        const duration = Number(video.duration);
        if (Number.isFinite(duration) && duration > 0) {
          state.loaded.set(key, duration);
          video.classList.add("is-ready");
          applyVideoTime(video, playhead, duration, chapter.fps);
        }
        resolve();
      };
      video.pause();
      video.classList.remove("is-ready");
      video.preload = "auto";
      video.src = src;
      video.load();
      video.pause();
      if (video.readyState >= 1) finish();
      else video.addEventListener("loadedmetadata", finish, { once: true, signal: listener.signal });
    });
  };

  const frontVideo = () => videos[state.front] || videos[0];
  const standbyVideo = () => videos[1 - state.front] || videos[0];

  const sourceMatches = (video, src) => {
    const current = video.currentSrc || video.getAttribute("src") || "";
    return Boolean(src) && (current === src || current.endsWith(src));
  };

  const showChapter = (index, local) => {
    const chapter = chapters[index];
    if (!chapter) return;
    const needed = pair(chapter).src;
    const front = frontVideo();
    if (state.chapter === index && !state.swapping && sourceMatches(front, needed)) {
      const duration = Number(front.duration) || state.loaded.get(videoKey(chapter, needed)) || 0;
      applyVideoTime(front, local, duration, chapter.fps);
      return;
    }
    if (state.swapping && state.pendingChapter === index) {
      const incoming = state.chapter === index ? front : standbyVideo();
      const duration = Number(incoming.duration) || state.loaded.get(videoKey(chapter, needed)) || 0;
      applyVideoTime(incoming, local, duration, chapter.fps);
      return;
    }

    const token = ++state.swapGen;
    state.swapping = true;
    state.pendingChapter = index;
    const incoming = state.chapter === index || state.chapter < 0 ? front : standbyVideo();
    loadVideo(incoming, chapter, { playhead: local }).then(() => {
      if (token !== state.swapGen) return;
      if (incoming !== front) {
        incoming.classList.add("is-front");
        front.classList.remove("is-front");
        front.pause();
        state.front = videos.indexOf(incoming);
        if (state.front < 0) state.front = 0;
      }
      state.chapter = index;
      state.pendingChapter = -1;
      state.swapping = false;
      preloadNeighbor(index, local);
    });
  };

  const preloadNeighbor = (index, local) => {
    if (state.swapping || videos.length < 2 || prefersReducedMotion()) return;
    const nextIndex = local >= PRELOAD_AT ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= chapters.length) return;
    loadVideo(standbyVideo(), chapters[nextIndex], { silentPoster: true });
  };

  const apply = () => {
    const progress = prefersReducedMotion() ? 0 : state.current;
    const { index, local } = prefersReducedMotion()
      ? { index: 0, local: 0 }
      : chapterFromProgress(progress, chapters);
    applyHud(index, local);
    applyPinned();
    if (prefersReducedMotion()) return;
    if (state.onscreen || state.near) {
      showChapter(index, local);
      if (!state.swapping) preloadNeighbor(index, local);
    }
  };

  const tick = () => {
    state.raf = 0;
    const ease = prefersReducedMotion() ? 1 : LERP;
    state.current += (state.target - state.current) * ease;
    const snap = frameProgress(totalDuration());
    if (Math.abs(state.target - state.current) < snap) state.current = state.target;
    apply();
    const moving = Math.abs(state.target - state.current) > snap;
    root.classList.toggle("is-ticking", moving && state.onscreen);
    if (state.running && moving) state.raf = requestAnimationFrame(tick);
    else {
      state.running = false;
      root.classList.remove("is-ticking");
    }
  };

  const sync = () => {
    state.target = prefersReducedMotion() ? 0 : progressThrough(track, stage);
    if (prefersReducedMotion()) {
      state.current = 0;
      apply();
      return;
    }
    if (!state.running) {
      state.running = true;
      state.raf = requestAnimationFrame(tick);
    }
  };

  const enterFallback = (chapter) => {
    if (chapter.mode === "fallback") return;
    chapter.mode = "fallback";
    if (chapters[state.chapter] === chapter) {
      const { local } = chapterFromProgress(state.current, chapters);
      showChapter(Math.max(0, chapters.indexOf(chapter)), local);
    }
  };

  const applyThemeSource = () => {
    const { index, local } = chapterFromProgress(state.current, chapters);
    const chapter = chapters[index] || chapters[0];
    applyPoster(pair(chapter).poster, { paintVideos: false });
    if (prefersReducedMotion()) return;

    const front = frontVideo();
    const needed = pair(chapter).src;
    if (sourceMatches(front, needed) && front.classList.contains("is-ready")) {
      const duration = Number(front.duration) || state.loaded.get(videoKey(chapter, needed)) || chapter.duration;
      applyVideoTime(front, local, duration, chapter.fps);
      preloadNeighbor(index, local);
      return;
    }

    const token = ++state.swapGen;
    state.swapping = true;
    state.pendingChapter = index;
    const incoming = videos.length > 1 ? standbyVideo() : front;
    loadVideo(incoming, chapter, { playhead: local, silentPoster: true }).then(() => {
      if (token !== state.swapGen) return;
      if (incoming !== front) {
        incoming.classList.add("is-front");
        front.classList.remove("is-front");
        front.pause();
        state.front = videos.indexOf(incoming);
        if (state.front < 0) state.front = 0;
      }
      state.chapter = index;
      state.pendingChapter = -1;
      state.swapping = false;
      applyPoster(pair(chapter).poster);
      preloadNeighbor(index, local);
    });
  };

  const observe = (element, margin, onChange) => {
    if (!("IntersectionObserver" in window)) {
      onChange(true);
      return null;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => onChange(entry.isIntersecting));
    }, { rootMargin: margin, threshold: 0 });
    observer.observe(element);
    return observer;
  };

  videos.forEach((video) => {
    video.pause();
    video.addEventListener("error", () => enterFallback(chapters[Math.max(0, state.chapter)]), { signal: listener.signal });
  });
  if (poster) {
    poster.addEventListener("error", () => {
      const fallback = readPair((chapters[Math.max(0, state.chapter)] || chapters[0]).node, "fallback").poster;
      if (fallback && poster.getAttribute("src") !== fallback) poster.src = fallback;
    }, { signal: listener.signal });
  }

  applyPoster(pair(chapters[0]).poster);

  const observers = [
    observe(root, NEAR_MARGIN, (near) => {
      state.near = near;
      if (near && !prefersReducedMotion()) {
        const { index, local } = chapterFromProgress(state.target || state.current, chapters);
        showChapter(index, local);
        preloadNeighbor(index, Math.max(local, PRELOAD_AT));
      }
    }),
    observe(root, ON_MARGIN, (onscreen) => {
      state.onscreen = onscreen;
      if (onscreen) sync();
      else {
        videos.forEach((video) => video.pause());
        applyPinned();
      }
    }),
  ].filter(Boolean);

  fetch(MANIFEST_PATH, { signal: listener.signal })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data?.moments) return;
      chapters.forEach((chapter) => {
        const incoming = data.moments[chapter.id];
        if (!incoming) return;
        if (Number.isFinite(Number(incoming.duration_seconds))) chapter.duration = Number(incoming.duration_seconds);
        if (Number.isFinite(Number(incoming.fps))) chapter.fps = Number(incoming.fps);
        chapter.shotEnds = proofEndsFromShots(incoming.shots, chapter.proofs.length);
      });
      root.style.setProperty("--journey-duration", String(totalDuration()));
      sync();
    })
    .catch(() => {});

  window.addEventListener("portfolio:theme-change", applyThemeSource, { signal: listener.signal });
  window.addEventListener("scroll", sync, { passive: true, signal: listener.signal });
  window.addEventListener("resize", () => {
    applyThemeSource();
    sync();
  }, { passive: true, signal: listener.signal });
  viewportQuery.addEventListener?.("change", () => {
    applyThemeSource();
    sync();
  }, { signal: listener.signal });
  motionQuery.addEventListener?.("change", () => initProjectJourney(), { signal: listener.signal });
  sync();

  cleanupProjectJourney = () => {
    listener.abort();
    observers.forEach((observer) => observer.disconnect());
    document.documentElement.classList.remove("is-journey-pinned");
    stop();
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProjectJourney, { once: true });
} else {
  initProjectJourney();
}
document.addEventListener("astro:page-load", initProjectJourney);
document.addEventListener("astro:before-preparation", () => cleanupProjectJourney());
