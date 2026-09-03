const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const viewportQuery = window.matchMedia("(max-width: 900px)");
const prefersReducedMotion = () => motionQuery.matches;
const isCompactViewport = () => viewportQuery.matches;

const NEAR_MARGIN = "160% 0px";
const ON_MARGIN = "12% 0px";
const LERP = 0.18;
const SNAP = 0.0008;
const VIDEO_EPS = 0.008;
const MANIFEST_PATH = "/assets/stories/moments/moments-timeline.json";

let cleanupProjectMoments = () => {};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function activeTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function viewportVariant() {
  return isCompactViewport() ? "portrait" : "landscape";
}

function shotIndex(progress, ends) {
  let index = 0;
  while (index < ends.length - 1 && progress >= ends[index]) index += 1;
  return index;
}

function equalShots(count) {
  return Array.from({ length: Math.max(1, count) }, (_, i) => (i + 1) / Math.max(1, count));
}

function progressThrough(track) {
  const rect = track.getBoundingClientRect();
  const travel = Math.max(1, track.offsetHeight - window.innerHeight);
  return clamp(-rect.top / travel);
}

function readAssets(root) {
  const read = (key) => root.getAttribute(`data-${key}`) || "";
  return {
    landscape: {
      light: { src: read("src-landscape-light"), poster: read("poster-landscape-light") },
      dark: { src: read("src-landscape-dark"), poster: read("poster-landscape-dark") },
    },
    portrait: {
      light: { src: read("src-portrait-light"), poster: read("poster-portrait-light") },
      dark: { src: read("src-portrait-dark"), poster: read("poster-portrait-dark") },
    },
    fallback: {
      light: { src: read("fallback-light"), poster: read("fallback-poster-light") },
      dark: { src: read("fallback-dark"), poster: read("fallback-poster-dark") },
    },
  };
}

function initProjectMoments() {
  cleanupProjectMoments();

  const moments = [...document.querySelectorAll("[data-moment]")].map((root) => {
    const proofCount = root.querySelectorAll(".moment-proof").length;
    const steps = Math.max(1, Number(root.dataset.steps) || proofCount + 1);
    return {
          root,
          track: root.querySelector(".project-moment-track") || root,
          video: root.querySelector("[data-moment-video]"),
          poster: root.querySelector("[data-moment-poster]"),
          proofs: [...root.querySelectorAll(".moment-proof")],
          card: root.querySelector("[data-moment-card]"),
          story: root.dataset.story || "matcher",
          steps,
          shotEnds: equalShots(steps),
          assets: readAssets(root),
          mode: "moment",
          target: 0,
          current: 0,
          near: false,
          onscreen: false,
          duration: 0,
          swapping: false,
        };
  });

  const listener = new AbortController();
  let raf = 0;
  let running = false;

  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    moments.forEach((moment) => moment.root.classList.remove("is-ticking"));
  };

  const pair = (moment) => {
    const theme = activeTheme();
    if (moment.mode === "fallback") return moment.assets.fallback[theme];
    return moment.assets[viewportVariant()][theme] || moment.assets.fallback[theme];
  };

  const applyPoster = (moment, url) => {
    const fallback = moment.assets.fallback[activeTheme()].poster;
    const visible = url || fallback;
    if (moment.poster && moment.poster.getAttribute("src") !== visible) moment.poster.src = visible;
    if (moment.video) moment.video.poster = visible;
  };

  const readDuration = (moment) => {
    const next = Number(moment.video?.duration);
    moment.duration = Number.isFinite(next) && next > 0 ? next : 0;
  };

  const applyVideoTime = (moment, progress) => {
    const video = moment.video;
    if (!video || !moment.duration || moment.swapping || prefersReducedMotion()) return;
    const time = clamp(progress) * moment.duration;
    if (Math.abs(video.currentTime - time) > VIDEO_EPS) {
      try {
        video.currentTime = time;
      } catch {
        /* currentTime can throw before the first frame is decodable */
      }
    }
  };

  const applyMoment = (moment) => {
    const progress = prefersReducedMotion() ? 1 : moment.current;
    const step = shotIndex(progress, moment.shotEnds);
    const onCard = step >= moment.proofs.length;
    moment.root.style.setProperty("--moment-progress", progress.toFixed(4));
    moment.root.dataset.activeStep = String(step);
    moment.root.classList.toggle("is-card-beat", prefersReducedMotion() || onCard);
    moment.proofs.forEach((proof, index) => {
      const active = prefersReducedMotion() || (!onCard && index === step);
      proof.classList.toggle("is-active", active);
      if (prefersReducedMotion()) proof.removeAttribute("aria-hidden");
      else proof.toggleAttribute("aria-hidden", !active);
    });
    if (moment.card) {
      const showCard = prefersReducedMotion() || onCard;
      moment.card.classList.toggle("is-active", showCard);
      if (prefersReducedMotion()) moment.card.removeAttribute("aria-hidden");
      else moment.card.toggleAttribute("aria-hidden", !showCard);
    }
    if (moment.onscreen && moment.video && moment.duration) applyVideoTime(moment, progress);
  };

  const tick = () => {
    raf = 0;
    const ease = prefersReducedMotion() ? 1 : LERP;
    let keep = false;
    moments.forEach((moment) => {
      moment.current += (moment.target - moment.current) * ease;
      if (Math.abs(moment.target - moment.current) < SNAP) moment.current = moment.target;
      applyMoment(moment);
      const moving = Math.abs(moment.target - moment.current) > SNAP;
      moment.root.classList.toggle("is-ticking", moving && moment.onscreen);
      if (moving) keep = true;
    });
    if (running && keep) raf = requestAnimationFrame(tick);
    else {
      running = false;
      moments.forEach((moment) => moment.root.classList.remove("is-ticking"));
    }
  };

  const sync = () => {
    moments.forEach((moment) => {
      moment.target = prefersReducedMotion() ? 1 : progressThrough(moment.track);
      if (prefersReducedMotion()) moment.current = moment.target;
    });
    if (prefersReducedMotion()) {
      moments.forEach(applyMoment);
      return;
    }
    if (!running) {
      running = true;
      raf = requestAnimationFrame(tick);
    }
  };

  const loadVideo = (moment) => {
    const video = moment.video;
    if (!video) return;
    const { src, poster } = pair(moment);
    applyPoster(moment, poster);
    if (prefersReducedMotion() || !src) return;
    const currentSrc = video.currentSrc || video.getAttribute("src") || "";
    if (currentSrc.endsWith(src) || currentSrc === src) return;

    moment.swapping = true;
    video.pause();
    video.preload = "auto";
    video.src = src;
    video.load();
    video.pause();

    const onReady = () => {
      readDuration(moment);
      moment.swapping = false;
      applyMoment(moment);
      if (!prefersReducedMotion()) sync();
    };
    const onData = () => applyMoment(moment);
    if (video.readyState >= 1) onReady();
    else video.addEventListener("loadedmetadata", onReady, { once: true, signal: listener.signal });
    if (video.readyState >= 3) onData();
    else video.addEventListener("canplay", onData, { once: true, signal: listener.signal });
  };

  const enterFallback = (moment) => {
    if (moment.mode === "fallback") return;
    moment.mode = "fallback";
    moment.duration = 0;
    loadVideo(moment);
  };

  const applyThemeSource = () => {
    moments.forEach((moment) => {
      applyPoster(moment, pair(moment).poster);
      if (moment.near && !prefersReducedMotion()) loadVideo(moment);
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

  const observers = [];
  moments.forEach((moment) => {
    if (moment.video) {
      moment.video.pause();
      applyPoster(moment, pair(moment).poster);
      moment.video.addEventListener("loadedmetadata", () => readDuration(moment), { signal: listener.signal });
      moment.video.addEventListener("error", () => enterFallback(moment), { signal: listener.signal });
      if (moment.poster) {
        moment.poster.addEventListener("error", () => {
          const fallback = moment.assets.fallback[activeTheme()].poster;
          if (moment.poster.getAttribute("src") !== fallback) moment.poster.src = fallback;
        }, { signal: listener.signal });
      }
      if (moment.video.readyState >= 1) readDuration(moment);
    }

    const nearObs = observe(moment.root, NEAR_MARGIN, (near) => {
      moment.near = near;
      if (near) loadVideo(moment);
    });
    const onObs = observe(moment.root, ON_MARGIN, (onscreen) => {
      moment.onscreen = onscreen;
      if (onscreen) {
        applyMoment(moment);
        sync();
      } else if (moment.video) {
        moment.video.pause();
      }
    });
    if (nearObs) observers.push(nearObs);
    if (onObs) observers.push(onObs);
  });

  const applyManifest = (data) => {
    if (!data?.moments) return;
    moments.forEach((moment) => {
      const incoming = data.moments[moment.story];
      if (!incoming) return;
      const ends = (incoming.shot_ends || incoming.shots?.map((shot) => Number(shot.end_progress ?? shot.progress?.[1])))
        ?.map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      if (ends?.length) moment.shotEnds = ends;
    });
  };

  fetch(MANIFEST_PATH, { signal: listener.signal })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      applyManifest(data);
      sync();
    })
    .catch(() => {});

  const themeObserver = new MutationObserver(applyThemeSource);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("scroll", sync, { passive: true, signal: listener.signal });
  window.addEventListener("resize", () => {
    applyThemeSource();
    sync();
  }, { passive: true, signal: listener.signal });
  viewportQuery.addEventListener?.("change", () => {
    applyThemeSource();
    sync();
  }, { signal: listener.signal });
  motionQuery.addEventListener?.("change", () => initProjectMoments(), { signal: listener.signal });
  sync();

  cleanupProjectMoments = () => {
    listener.abort();
    themeObserver.disconnect();
    observers.forEach((observer) => observer.disconnect());
    stop();
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProjectMoments, { once: true });
} else {
  initProjectMoments();
}
document.addEventListener("astro:page-load", initProjectMoments);
document.addEventListener("astro:before-preparation", () => cleanupProjectMoments());
