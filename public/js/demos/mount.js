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

function watchLifecycle(figure, lifecycle) {
  if (!lifecycle || (typeof lifecycle.pause !== "function" && typeof lifecycle.resume !== "function")) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) lifecycle.resume?.();
        else lifecycle.pause?.();
      }
    },
    { rootMargin: ROOT_MARGIN }
  );
  observer.observe(figure);

  const onVisibility = () => {
    if (document.hidden) lifecycle.pause?.();
    else if (figure.getBoundingClientRect().top < window.innerHeight) lifecycle.resume?.();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const teardown = () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    lifecycle.destroy?.();
  };
  const onPageHide = (event) => {
    if (event.persisted) lifecycle.pause?.();
    else teardown();
  };
  window.addEventListener("pagehide", onPageHide);

  // Expose cleanup for error/retry paths
  lifecycle._teardown = teardown;
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
  img.loading = "lazy";
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
    const cap = figure.querySelector("figcaption");
    if (cap) {
      cap.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = "Static fallback";
      const detail = document.createElement("span");
      detail.textContent = figure.dataset.fallbackCaption || "Interactive demo unavailable. Showing static hardware.";
      cap.append(title, detail);
    }
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

function mountDemo(figure) {
  const name = figure.dataset.demo;
  const frame = figure.querySelector(".hardware-demo-frame");
  const loader = DEMO_LOADERS[name];
  if (!frame || !loader) return;

  applyDemoHint(figure);

  frame.setAttribute("role", "group");
  if (["impedance-matcher", "companion", "keychain-chase"].includes(name)) {
    frame.tabIndex = 0;
  }

  const cap = figure.querySelector("figcaption");
  if (cap) {
    if (!cap.id) cap.id = `demo-hint-${name}`;
    frame.setAttribute("aria-describedby", cap.id);
  }

  const run = () => {
    const skeleton = createSkeleton();
    frame.replaceChildren(skeleton);
    frame.setAttribute("aria-busy", "true");

    loader()
      .then((mod) => {
        skeleton.remove();
        frame.removeAttribute("aria-busy");
        frame.replaceChildren();
        const lifecycle = mod.mount(frame);
        watchLifecycle(figure, lifecycle);
      })
      .catch((err) => {
        console.error(`[hardware-demo] failed to load ${name}`, err);
        frame.removeAttribute("aria-busy");
        showError(frame, figure, name, run);
      });
  };

  run();
}

function observeAndMount(figures) {
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

  figures.forEach((figure) => observer.observe(figure));
}

observeAndMount(Array.from(document.querySelectorAll(".hardware-demo[data-demo]")));
