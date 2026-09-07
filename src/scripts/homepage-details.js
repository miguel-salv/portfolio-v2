const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(min-width: 901px) and (hover: hover) and (pointer: fine)");
const entryKey = "homepage-details-entry-played";
const TRACE_MS = 800;
const ENTRY_MS = 820;
let hasPlayedEntry = false;
let cleanupHomepageDetails = () => {};

function motionAllowed() { return !reducedMotion.matches && !document.hidden; }
function entryAlreadyPlayed() {
  if (hasPlayedEntry) return true;
  try { return sessionStorage.getItem(entryKey) === "1"; } catch { return false; }
}
function markEntryPlayed() { hasPlayedEntry = true; try { sessionStorage.setItem(entryKey, "1"); } catch {} }
function readSession(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function hasPendingHash() {
  if (window.__portfolioHash) return true;
  try { if (document.documentElement?.classList?.contains("hash-pending")) return true; } catch {}
  return Boolean(readSession("portfolio-scroll"));
}
function hasStoredScroll() {
  if (window.scrollY >= 64) return true;
  if (Number(window.__portfolioScrollY) > 64) return true;
  try {
    const saved = JSON.parse(readSession("portfolio-scroll-y") || "null");
    if (saved && typeof saved.y === "number" && saved.y > 64) {
      if (!saved.path || saved.path === location.pathname) return true;
    }
  } catch {}
  return false;
}
function isBackForward() {
  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0];
    if (nav?.type === "back_forward") return true;
  } catch {}
  try { if (performance.navigation?.type === 2) return true; } catch {}
  return false;
}
function eligibleForEntry() {
  return motionAllowed() && !entryAlreadyPlayed() && !location.hash && !hasPendingHash()
    && !hasStoredScroll() && !isBackForward() && performance.now() < 1000;
}
function allowReveals() {
  if (!motionAllowed()) return false;
  try { if (document.documentElement?.classList?.contains("hash-pending")) return false; } catch {}
  return true;
}

const TRACE_X0 = 2, TRACE_X1 = 86, TRACE_STEPS = 48;
const traceXs = Array.from({ length: TRACE_STEPS + 1 }, (_, i) => TRACE_X0 + ((TRACE_X1 - TRACE_X0) * i) / TRACE_STEPS);
function squareY(x) {
  const pos = ((x - TRACE_X0) % 24 + 24) % 24;
  return pos < 12 ? 15 : 5;
}
function noisyY(x, time) {
  return 10 + 3.1 * Math.sin(x * 0.38 + 0.55) + 1.7 * Math.sin(x * 0.93 + 2.05)
    + 0.85 * Math.sin(x * 1.62 + 0.15) + 0.35 * Math.sin(time * 0.022 + x * 0.21);
}
function buildTrace(t, time) {
  const eased = 1 - Math.pow(1 - t, 3);
  const jitter = (1 - eased) * 0.45;
  return traceXs.map((x, i) => {
    const y = noisyY(x, time) + (squareY(x) - noisyY(x, time)) * eased + jitter * Math.sin(x * 0.47 + time * 0.019);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(2)}`;
  }).join(" ");
}
function squarePath() {
  return traceXs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${squareY(x).toFixed(2)}`).join(" ");
}

function initHomepageDetails() {
  cleanupHomepageDetails();
  const journey = document.querySelector("[data-journey]");
  if (!journey) return;
  const abort = new AbortController();
  const { signal } = abort;
  const animations = [];
  const frames = new Set();
  const observers = [];
  const revealNodes = [];
  let depthFrame = 0, traceFrame = 0, activeEntry = false;
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0, lastTime = 0;
  let pointerBound = false;
  const stage = journey.querySelector("[data-journey-stage]");
  const depth = journey.querySelector("[data-journey-depth]");
  const title = journey.querySelector("[data-animate-title]");
  const availability = journey.querySelector("[data-entry-availability]");
  const actions = journey.querySelector("[data-entry-actions]");
  const bench = journey.querySelector(".project-journey-stage");
  const tracePath = journey.querySelector(".trace-path") || document.querySelector(".trace-path");
  const requestFrame = (callback) => {
    const id = requestAnimationFrame((now) => { frames.delete(id); callback(now); });
    frames.add(id);
    return id;
  };
  const cancelFrame = (id) => { if (id) { cancelAnimationFrame(id); frames.delete(id); } };
  const cancelAllFrames = () => { frames.forEach((id) => cancelAnimationFrame(id)); frames.clear(); depthFrame = 0; traceFrame = 0; };
  const play = (node, keyframes, options) => {
    if (!node?.animate) return;
    const animation = node.animate(keyframes, options);
    animations.push(animation);
    return animation;
  };
  const finishEntry = () => {
    animations.splice(0).forEach((animation) => { try { animation.finish(); } catch {} });
    activeEntry = false;
  };
  const cancelEntry = () => {
    animations.splice(0).forEach((animation) => { try { animation.cancel(); } catch {} });
    activeEntry = false;
  };
  const setSquareTrace = () => { cancelFrame(traceFrame); traceFrame = 0; tracePath?.setAttribute("d", squarePath()); };
  const resetDepth = () => {
    targetX = targetY = currentX = currentY = 0; lastTime = 0;
    cancelFrame(depthFrame); depthFrame = 0;
    if (depth) { depth.style.transform = ""; depth.style.willChange = ""; }
  };
  const clearReveals = () => {
    revealNodes.forEach((node) => node.classList.remove("cinematic-pending", "cinematic-in"));
  };
  const isIntro = () => journey.classList.contains("is-intro");
  const haltSpatial = () => {
    if (activeEntry) finishEntry();
    stage?.classList.remove("is-lit");
    setSquareTrace();
    resetDepth();
  };
  const paintDepth = (now) => {
    const elapsed = lastTime ? Math.min(64, now - lastTime) : 16;
    lastTime = now;
    const ratio = 1 - Math.exp(-elapsed / 100);
    currentX += (targetX - currentX) * ratio;
    currentY += (targetY - currentY) * ratio;
    if (depth) {
      depth.style.willChange = "transform";
      depth.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0) rotateX(${(-currentY * 0.06).toFixed(2)}deg) rotateY(${(currentX * 0.06).toFixed(2)}deg)`;
    }
    if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) depthFrame = requestFrame(paintDepth);
    else {
      depthFrame = 0; lastTime = 0;
      if (Math.abs(currentX) <= 0.1 && Math.abs(currentY) <= 0.1) {
        currentX = currentY = 0;
        if (depth) { depth.style.transform = ""; depth.style.willChange = ""; }
      }
    }
  };
  const requestDepth = () => { if (!depthFrame) depthFrame = requestFrame(paintDepth); };
  const onPointerMove = (event) => {
    if (!motionAllowed() || !finePointer.matches || !isIntro()) return;
    const rect = bench?.getBoundingClientRect();
    if (!rect) return;
    const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    targetX = (nx - 0.5) * 28;
    targetY = (ny - 0.5) * 16;
    requestDepth();
  };
  const onPointerLeave = () => { targetX = targetY = 0; requestDepth(); };
  const bindPointer = () => {
    if (pointerBound || signal.aborted || !finePointer.matches) return;
    journey.addEventListener("pointermove", onPointerMove, { signal });
    journey.addEventListener("pointerleave", onPointerLeave, { signal });
    pointerBound = true;
  };
  const unbindPointer = () => {
    journey.removeEventListener("pointermove", onPointerMove);
    journey.removeEventListener("pointerleave", onPointerLeave);
    pointerBound = false;
    resetDepth();
  };
  const syncPointer = () => {
    if (signal.aborted) return;
    if (finePointer.matches) bindPointer();
    else unbindPointer();
  };
  const runTrace = () => {
    if (!tracePath) return;
    if (!motionAllowed()) { setSquareTrace(); return; }
    let start = 0;
    const frame = (now) => {
      if (!start) start = now;
      const t = Math.min((now - start) / TRACE_MS, 1);
      tracePath.setAttribute("d", t < 1 ? buildTrace(t, now) : squarePath());
      if (t < 1 && motionAllowed()) traceFrame = requestFrame(frame);
      else { traceFrame = 0; tracePath.setAttribute("d", squarePath()); }
    };
    traceFrame = requestFrame(frame);
  };
  const runEntry = () => {
    if (!eligibleForEntry()) { if (tracePath && !motionAllowed()) setSquareTrace(); return; }
    markEntryPlayed();
    activeEntry = true;
    stage?.classList.add("is-lit");
    const ease = "cubic-bezier(.16, 1, .3, 1)";
    play(title, [{ opacity: 0.72, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: ENTRY_MS, easing: ease, fill: "both" });
    play(availability, [{ opacity: 0.68, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 700, delay: 90, easing: ease, fill: "both" });
    play(actions, [{ opacity: 0.82, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 640, delay: 140, easing: ease, fill: "both" });
    play(stage, [{ opacity: 0.86, transform: "translateY(8px) scale(.992)" }, { opacity: 1, transform: "none" }], { duration: ENTRY_MS, easing: ease, fill: "both" });
    runTrace();
    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => { activeEntry = false; });
  };
  const syncJourneyState = () => {
    if (!isIntro()) { if (activeEntry) finishEntry(); stage?.classList.remove("is-lit"); resetDepth(); }
  };
  const observeOnce = (node, onEnter) => {
    if (!node || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((item) => item.isIntersecting)) return;
      onEnter();
      observer.disconnect();
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    observer.observe(node);
    observers.push(observer);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  };
  const armReveal = (nodes, root) => {
    const targets = nodes.filter(Boolean);
    if (!targets.length) return;
    revealNodes.push(...targets);
    if (!allowReveals() || typeof IntersectionObserver !== "function") return;
    const pending = targets.filter((node) => node.getBoundingClientRect().top >= window.innerHeight - 40);
    if (!pending.length) { targets.forEach((node) => node.classList.add("cinematic-in")); return; }
    pending.forEach((node) => node.classList.add("cinematic-pending"));
    targets.filter((node) => !pending.includes(node)).forEach((node) => node.classList.add("cinematic-in"));
    observeOnce(root || pending[0], () => {
      targets.forEach((node) => {
        node.classList.remove("cinematic-pending");
        node.classList.add("cinematic-in");
      });
    });
  };
  let revealsArmed = false;
  const armSectionReveals = () => {
    if (revealsArmed || !allowReveals()) return;
    revealsArmed = true;
    const about = document.querySelector("[data-cinematic-about]");
    armReveal([
      document.querySelector("[data-cinematic-about-portrait]"),
      document.querySelector("[data-cinematic-about-heading]"),
      document.querySelector("[data-cinematic-about-body]"),
      document.querySelector("[data-cinematic-about-contact]")
    ], about);
    [...document.querySelectorAll("[data-cinematic-role]")].forEach((role) => armReveal([role]));
  };
  armSectionReveals();
  if (!revealsArmed) {
    const pendingRestore = new MutationObserver(() => {
      if (!allowReveals()) return;
      armSectionReveals();
      pendingRestore.disconnect();
    });
    pendingRestore.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observers.push(pendingRestore);
  }
  const journeyState = new MutationObserver(syncJourneyState);
  journeyState.observe(journey, { attributes: true, attributeFilter: ["class"] });
  observers.push(journeyState);
  document.addEventListener("visibilitychange", () => { if (document.hidden) haltSpatial(); }, { signal });
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) haltSpatial(); }, { signal });
  finePointer.addEventListener("change", syncPointer, { signal });
  syncPointer();
  syncJourneyState();
  if (tracePath && (entryAlreadyPlayed() || !eligibleForEntry())) setSquareTrace();
  runEntry();
  cleanupHomepageDetails = () => {
    abort.abort();
    observers.forEach((observer) => observer.disconnect());
    cancelEntry();
    cancelAllFrames();
    unbindPointer();
    if (depth) { depth.style.transform = ""; depth.style.willChange = ""; }
    if (stage) { stage.style.transform = ""; stage.classList.remove("is-lit"); }
    [title, availability, actions].forEach((node) => { if (node) node.style.transform = ""; });
    clearReveals();
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHomepageDetails, { once: true });
else initHomepageDetails();
document.addEventListener("astro:page-load", initHomepageDetails);
document.addEventListener("astro:before-preparation", () => cleanupHomepageDetails());
