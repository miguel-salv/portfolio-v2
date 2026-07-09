import { applyDemoHint } from "./platform.js";

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

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) lifecycle.pause?.();
    else if (figure.getBoundingClientRect().top < window.innerHeight) lifecycle.resume?.();
  });
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

function mountDemo(figure) {
  const name = figure.dataset.demo;
  const frame = figure.querySelector(".hardware-demo-frame");
  const loader = DEMO_LOADERS[name];
  if (!frame || !loader) return;

  applyDemoHint(figure);

  frame.tabIndex = 0;
  frame.setAttribute("role", "application");

  const cap = figure.querySelector("figcaption");
  if (cap) {
    if (!cap.id) cap.id = `demo-hint-${name}`;
    frame.setAttribute("aria-describedby", cap.id);
  }

  const skeleton = createSkeleton();
  frame.setAttribute("aria-busy", "true");
  frame.appendChild(skeleton);

  loader()
    .then((mod) => {
      skeleton.remove();
      frame.removeAttribute("aria-busy");
      const lifecycle = mod.mount(frame);
      watchLifecycle(figure, lifecycle);
    })
    .catch((err) => {
      console.error(`[hardware-demo] failed to load ${name}`, err);
      frame.removeAttribute("aria-busy");

      const errWrap = document.createElement("div");
      errWrap.className = "hardware-demo-error";
      errWrap.setAttribute("role", "alert");

      const msg = document.createElement("p");
      msg.className = "hardware-demo-error-msg";
      msg.textContent = "Demo failed to load.";

      const action = document.createElement("button");
      action.type = "button";
      action.className = "hardware-demo-error-action";
      action.textContent = "Reload Page";
      action.addEventListener("click", () => location.reload());

      errWrap.appendChild(msg);
      errWrap.appendChild(action);
      frame.replaceChildren(errWrap);
    });
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
