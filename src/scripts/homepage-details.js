const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(min-width: 901px) and (hover: hover) and (pointer: fine)");
const entryKey = "homepage-details-entry-played";
let hasPlayedEntry = false;
let cleanupHomepageDetails = () => {};

function motionAllowed() { return !reducedMotion.matches && !document.hidden; }
function entryAlreadyPlayed() {
  if (hasPlayedEntry) return true;
  try { return sessionStorage.getItem(entryKey) === "1"; } catch { return false; }
}
function markEntryPlayed() { hasPlayedEntry = true; try { sessionStorage.setItem(entryKey, "1"); } catch {} }

function initHomepageDetails() {
  cleanupHomepageDetails();
  const journey = document.querySelector("[data-journey]");
  if (!journey) return;
  const abort = new AbortController();
  const { signal } = abort;
  const animations = [];
  let depthFrame = 0, activeEntry = false, targetX = 0, targetY = 0, currentX = 0, currentY = 0, lastTime = 0;
  const entry = journey.querySelector("[data-journey-artwork-entry]");
  const depth = journey.querySelector("[data-journey-artwork-depth]");
  const title = journey.querySelector("[data-animate-title]");
  const availability = journey.querySelector(".journey-availability");
  const actions = journey.querySelector(".hero-actions");
  const finishEntry = () => { animations.splice(0).forEach((animation) => animation.finish()); activeEntry = false; };
  const resetDepth = () => {
    targetX = targetY = currentX = currentY = 0; lastTime = 0;
    cancelAnimationFrame(depthFrame); depthFrame = 0;
    if (depth) depth.style.transform = "";
  };
  const isIntro = () => journey.classList.contains("is-intro");
  const paintDepth = (now) => {
    const elapsed = lastTime ? Math.min(64, now - lastTime) : 16;
    lastTime = now;
    const ratio = 1 - Math.exp(-elapsed / 100);
    currentX += (targetX - currentX) * ratio;
    currentY += (targetY - currentY) * ratio;
    if (depth) depth.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0) rotateX(${(-currentY * .075).toFixed(2)}deg) rotateY(${(currentX * .075).toFixed(2)}deg)`;
    if (Math.abs(targetX - currentX) > .1 || Math.abs(targetY - currentY) > .1) depthFrame = requestAnimationFrame(paintDepth);
    else { depthFrame = 0; if (!currentX && !currentY && depth) depth.style.transform = ""; }
  };
  const requestDepth = () => { if (!depthFrame) depthFrame = requestAnimationFrame(paintDepth); };
  const eligibleForEntry = () => motionAllowed() && !entryAlreadyPlayed() && !location.hash && window.scrollY < 64 && performance.now() < 1000;
  const runEntry = () => {
    if (!eligibleForEntry()) return;
    markEntryPlayed(); activeEntry = true;
    entry?.classList.add("is-lit");
    const options = { easing: "cubic-bezier(.16, 1, .3, 1)", fill: "both" };
    if (title) animations.push(title.animate([{ transform: "translateY(10px)" }, { transform: "none" }], { ...options, duration: 560 }));
    if (availability) animations.push(availability.animate([{ opacity: .65, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { ...options, delay: 60, duration: 400 }));
    if (actions) animations.push(actions.animate([{ transform: "translateY(4px)" }, { transform: "none" }], { ...options, delay: 100, duration: 320 }));
    if (entry) animations.push(entry.animate([{ transform: "translateY(10px) scale(.99)" }, { transform: "none" }], { ...options, duration: 680 }));
    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => { activeEntry = false; });
  };
  const syncJourneyState = () => {
    if (!isIntro()) { if (activeEntry) finishEntry(); entry?.classList.remove("is-lit"); resetDepth(); }
  };
  const journeyState = new MutationObserver(syncJourneyState);
  journeyState.observe(journey, { attributes: true, attributeFilter: ["class"] });
  journey.addEventListener("pointermove", (event) => {
    if (!motionAllowed() || !finePointer.matches || !isIntro()) return;
    const rect = journey.querySelector(".project-journey-stage")?.getBoundingClientRect();
    if (!rect) return;
    const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    targetX = (nx - .5) * 28;
    targetY = (ny - .5) * 16;
    requestDepth();
  }, { signal });
  journey.addEventListener("pointerleave", () => { targetX = targetY = 0; requestDepth(); }, { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { if (activeEntry) finishEntry(); entry?.classList.remove("is-lit"); resetDepth(); } }, { signal });
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) { if (activeEntry) finishEntry(); entry?.classList.remove("is-lit"); resetDepth(); } }, { signal });
  finePointer.addEventListener("change", () => { if (!finePointer.matches) resetDepth(); }, { signal });
  const onceInView = (selector, activeClass) => {
    const node = document.querySelector(selector);
    if (!node || reducedMotion.matches || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((item) => item.isIntersecting)) return;
      node.classList.add(activeClass); observer.disconnect();
    }, { threshold: .2 });
    observer.observe(node);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  };
  const revealNodes = [...document.querySelectorAll("[data-cinematic-title],[data-cinematic-portrait],[data-cinematic-copy],[data-cinematic-timeline]")];
  let revealObserver = null;
  if (motionAllowed() && "IntersectionObserver" in window) {
    const pending = revealNodes.filter((node) => node.getBoundingClientRect().top >= window.innerHeight - 40);
    pending.forEach((node) => node.classList.add("cinematic-pending"));
    revealNodes.filter((node) => !pending.includes(node)).forEach((node) => node.classList.add("cinematic-in"));
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((item) => {
        if (!item.isIntersecting) return;
        item.target.classList.remove("cinematic-pending");
        item.target.classList.add("cinematic-in");
        revealObserver?.unobserve(item.target);
      });
    }, { threshold: .16, rootMargin: "0px 0px -8% 0px" });
    pending.forEach((node) => revealObserver.observe(node));
  }
  syncJourneyState();
  runEntry();
  cleanupHomepageDetails = () => {
    abort.abort(); journeyState.disconnect(); revealObserver?.disconnect();
    animations.splice(0).forEach((animation) => animation.cancel());
    cancelAnimationFrame(depthFrame);
    if (depth) depth.style.transform = "";
    entry?.classList.remove("is-lit");
    revealNodes.forEach((node) => node.classList.remove("cinematic-pending", "cinematic-in"));
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHomepageDetails, { once: true });
else initHomepageDetails();
document.addEventListener("astro:page-load", initHomepageDetails);
document.addEventListener("astro:before-preparation", () => cleanupHomepageDetails());
