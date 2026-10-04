import { applyDemoHint } from "./platform.js";

/* Hardware demo shell.
 * HTML: figure.hardware-demo[data-demo] > .hardware-demo-frame + figcaption
 * Optional data-fallback-src/alt/width/height/caption for static recovery
 * Loader returns { pause, resume }; mount watches intersection + visibility
 * Frame gets role="group" and aria-describedby=figcaption. Demos with genuine
 * frame-level keyboard shortcuts opt into focus below.
 */

const DEMO_LOADERS = {
  "impedance-matcher": () => import("./impedance-matcher/index.js"),
  "impedance-heatmap": () => import("./impedance-heatmap/index.js"),
  "companion": () => import("./companion/index.js"),
  "vehicle-rtos": () => import("./vehicle-rtos/index.js"),
  "robot-cv": () => import("./robot-cv/index.js"),
  "keychain-chase": () => import("./keychain-chase/index.js"),
};

const ROOT_MARGIN = "200px 0px";
const activeDemoTeardowns = new Set();
const mountedDemos = new WeakMap();
let pendingObserver = null;

function watchLifecycle(figure, lifecycle) {
  if (!lifecycle || (typeof lifecycle.pause !== "function" && typeof lifecycle.resume !== "function")) {
    return;
  }

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !document.hidden) lifecycle.resume?.();
            else lifecycle.pause?.();
          }
        },
        { rootMargin: "0px" }
      )
    : null;
  observer?.observe(figure);

  const onVisibility = () => {
    if (document.hidden) lifecycle.pause?.();
    else {
      const rect = figure.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) lifecycle.resume?.();
      else lifecycle.pause?.();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  let disposed = false;
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    lifecycle.destroy?.();
  };
  const onPageHide = (event) => {
    if (event.persisted) lifecycle.pause?.();
    else teardown();
  };
  const onPageShow = (event) => {
    if (event.persisted) onVisibility();
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);

  // Expose cleanup for error/retry paths
  lifecycle._teardown = teardown;
  onVisibility();
}

function createSkeleton() {
  const skeleton = document.createElement("div");
  skeleton.className = "hardware-demo-skeleton";

  const label = document.createElement("span");
  label.className = "hardware-demo-skeleton-label";
  label.textContent = "Booting demo…";

  skeleton.appendChild(label);
  return skeleton;
}

function createFallback(figure) {
  const src = figure.dataset.fallbackSrc;
  if (!src) return null;

  const wrap = document.createElement("div");
  wrap.className = "hardware-demo-error";

  const img = document.createElement("img");
  img.src = src;
  img.alt = figure.dataset.fallbackAlt || "Static project hardware photo";
  img.width = Number(figure.dataset.fallbackWidth) || 800;
  img.height = Number(figure.dataset.fallbackHeight) || 600;
  img.loading = "eager";
  img.decoding = "async";
  img.style.width = "100%";
  img.style.height = "auto";
  img.style.maxWidth = "100%";

  const msg = document.createElement("p");
  msg.className = "hardware-demo-error-msg";
  msg.textContent = figure.dataset.fallbackCaption || "Interactive demo unavailable. Showing static hardware.";

  wrap.appendChild(img);
  wrap.appendChild(msg);
  return wrap;
}

function showError(frame, figure, name, retry) {
  const errWrap = document.createElement("div");
  errWrap.className = "hardware-demo-error";
  errWrap.setAttribute("role", "alert");

  const fallback = createFallback(figure);
  if (fallback) {
    fallback.setAttribute("role", "alert");
    frame.replaceChildren(fallback);

    const actions = document.createElement("div");
    actions.className = "hardware-demo-error-actions";

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "hardware-demo-error-action";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", retry);

    const reloadBtn = document.createElement("button");
    reloadBtn.type = "button";
    reloadBtn.className = "hardware-demo-error-action";
    reloadBtn.textContent = "Reload Page";
    reloadBtn.addEventListener("click", () => location.reload());

    actions.appendChild(retryBtn);
    actions.appendChild(reloadBtn);
    fallback.appendChild(actions);
    return;
  }

  const msg = document.createElement("p");
  msg.className = "hardware-demo-error-msg";
  msg.textContent = "Demo failed to load.";

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "hardware-demo-error-action";
  retryBtn.textContent = "Retry";
  retryBtn.addEventListener("click", retry);

  const reloadBtn = document.createElement("button");
  reloadBtn.type = "button";
  reloadBtn.className = "hardware-demo-error-action";
  reloadBtn.textContent = "Reload Page";
  reloadBtn.addEventListener("click", () => location.reload());

  errWrap.appendChild(msg);
  errWrap.appendChild(retryBtn);
  errWrap.appendChild(reloadBtn);
  frame.replaceChildren(errWrap);
}

export function mountDemo(figure, { loader = DEMO_LOADERS[figure.dataset.demo] } = {}) {
  if (mountedDemos.has(figure)) return mountedDemos.get(figure);
  const name = figure.dataset.demo;
  const frame = figure.querySelector(".hardware-demo-frame");
  if (!frame || !loader) return;

  applyDemoHint(figure);

  if (["impedance-matcher", "companion", "keychain-chase"].includes(name)) {
    frame.tabIndex = 0;
  }

  const cap = figure.querySelector("figcaption");
  const originalCaption = cap?.innerHTML;
  if (cap) {
    frame.setAttribute("aria-describedby", cap.id);
  }

  let loading = false;
  let lifecycle = null;
  let disposed = false;
  let generation = 0;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    generation++;
    lifecycle?._teardown?.();
    lifecycle = null;
    mountedDemos.delete(figure);
    activeDemoTeardowns.delete(cleanup);
  };
  mountedDemos.set(figure, cleanup);
  activeDemoTeardowns.add(cleanup);
  const run = () => {
    if (loading || disposed) return;
    const attempt = ++generation;
    delete figure.dataset.demoReady;
    loading = true;
    lifecycle?._teardown?.();
    lifecycle = null;
    if (cap && cap.innerHTML !== originalCaption) cap.innerHTML = originalCaption;
    const skeleton = createSkeleton();
    frame.replaceChildren(skeleton);
    frame.setAttribute("aria-busy", "true");

    loader()
      .then((mod) => {
        if (disposed || attempt !== generation || !figure.isConnected) return;
        skeleton.remove();
        frame.removeAttribute("aria-busy");
        frame.replaceChildren();
        lifecycle = mod.mount(frame);
        figure.dataset.demoReady = "true";
        if (figure.dataset.demoLabel) frame.setAttribute("aria-label", figure.dataset.demoLabel);
        watchLifecycle(figure, lifecycle);
      })
      .catch((err) => {
        if (disposed || attempt !== generation || !figure.isConnected) return;
        console.error(`[hardware-demo] failed to load ${name}`, err);
        frame.removeAttribute("aria-busy");
        showError(frame, figure, name, run);
      })
      .finally(() => {
        if (attempt === generation) loading = false;
      });
  };

  run();
  return cleanup;
}

function observeAndMount(figures) {
  pendingObserver?.disconnect();
  pendingObserver = null;
  if (!("IntersectionObserver" in window)) {
    figures.forEach(mountDemo);
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        obs.unobserve(entry.target);
        mountDemo(entry.target);
      }
    },
    { rootMargin: ROOT_MARGIN }
  );
  pendingObserver = observer;

  figures.forEach((figure) => observer.observe(figure));
}

function initDemos() {
  const figures = Array.from(document.querySelectorAll(".hardware-demo[data-demo]"));
  observeAndMount(figures);
}

function destroyDemos() {
  pendingObserver?.disconnect();
  pendingObserver = null;
  for (const teardown of Array.from(activeDemoTeardowns)) teardown();
}

document.addEventListener("astro:page-load", initDemos);
document.addEventListener("astro:before-preparation", destroyDemos);
