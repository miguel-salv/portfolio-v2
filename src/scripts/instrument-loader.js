import { createRetryableImport } from "./lazy-module.js";

let cleanupLoader = () => {};
const loadInstrument = createRetryableImport(() => import("./instrument.js"), { validate: module => typeof module?.mountInstrument === "function" });

export function mountInstrumentLoader(instrument, { load = loadInstrument } = {}) {
  instrument.dataset.loaderMounted = "true";
  const controller = new AbortController();
  const { signal } = controller;
  const toggle = document.querySelector("[data-instrument-toggle]");
  if (toggle) {
    const label = toggle.querySelector(".instrument-toggle-text");
    const initialLabel = label?.textContent || "Open the matched bench";
    const live = instrument.querySelector("[data-live]");
    let loaded = false;
    let loading = false;
    let loadTimer = 0;

    toggle.hidden = false;
    toggle.addEventListener("click", async (event) => {
      if (loaded || loading) return;
      event.preventDefault();
      if (load.needsReload?.()) { window.location.reload(); return; }
      loading = true;
      toggle.disabled = true;
      toggle.setAttribute("aria-busy", "true");
      if (label) label.textContent = "Loading the tuner…";
      try {
        const deadline = new Promise((_, reject) => {
          loadTimer = window.setTimeout(() => reject(new Error("Tuner loading timed out")), 12000);
        });
        const module = await Promise.race([Promise.resolve().then(load), deadline]);
        if (signal.aborted || !instrument.isConnected) return;
        module.mountInstrument();
        loaded = true;
        if (label) label.textContent = initialLabel;
        if (live) live.textContent = "Interactive tuner loaded.";
      } catch (_) {
        if (signal.aborted) return;
        if (label) label.textContent = load.needsReload?.() ? "Reload to load the tuner" : "Retry the tuner";
        if (live) live.textContent = "The tuner couldn’t load. Use the loading control to try again.";
      } finally {
        window.clearTimeout(loadTimer);
        loading = false;
        if (!signal.aborted) {
          toggle.disabled = false;
          toggle.removeAttribute("aria-busy");
        }
      }
      const exhibit = instrument.closest('[data-matcher-exhibit]');
      if (loaded && !signal.aborted && instrument.isConnected && toggle.getAttribute("aria-expanded") !== "true" && (!exhibit || exhibit.dataset.mode === 'tune')) toggle.click();
    }, { signal });
    return () => {
      controller.abort();
      window.clearTimeout(loadTimer);
      delete instrument.dataset.loaderMounted;
      toggle.disabled = false;
      toggle.removeAttribute("aria-busy");
      if (label) label.textContent = initialLabel;
    };
  } else {
    load().then((module) => {
      if (!signal.aborted && instrument.isConnected) module.mountInstrument();
    }).catch(() => {});
    return () => { controller.abort(); delete instrument.dataset.loaderMounted; };
  }
}

function initInstrumentLoader() {
  const instrument = document.querySelector("[data-instrument]");
  if (!instrument || instrument.dataset.loaderMounted === "true") return;
  cleanupLoader();
  cleanupLoader = mountInstrumentLoader(instrument);
  // Preparation disposes the controller before a navigation can be cancelled.
  // Its disclosure can still be open on the retained document.
  const toggle = document.querySelector("[data-instrument-toggle]");
  if (toggle?.getAttribute("aria-expanded") === "true") toggle.click();
}

document.addEventListener("astro:page-load", initInstrumentLoader);
document.addEventListener("astro:before-preparation", () => cleanupLoader());
