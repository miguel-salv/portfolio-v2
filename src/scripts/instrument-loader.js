function initInstrumentLoader() {
  const instrument = document.querySelector("[data-instrument]");
  if (!instrument || instrument.dataset.loaderMounted === "true") return;
  instrument.dataset.loaderMounted = "true";
  const toggle = document.querySelector("[data-instrument-toggle]");
  if (toggle) {
    const label = toggle.querySelector(".instrument-toggle-text");
    const initialLabel = label?.textContent || "Open the tuner";
    const live = instrument.querySelector("[data-live]");
    let loaded = false;
    let loading = false;

    toggle.hidden = false;
    toggle.addEventListener("click", async (event) => {
      if (loaded || loading) return;
      event.preventDefault();
      loading = true;
      toggle.disabled = true;
      toggle.setAttribute("aria-busy", "true");
      if (label) label.textContent = "Loading the tuner…";
      try {
        const module = await import("./instrument.js");
        module.mountInstrument();
        loaded = true;
        if (label) label.textContent = initialLabel;
        if (live) live.textContent = "Interactive tuner loaded.";
      } catch (_) {
        if (label) label.textContent = "Retry the tuner";
        if (live) live.textContent = "Interactive tuner failed to load. Select Retry the tuner to try again.";
      } finally {
        loading = false;
        toggle.disabled = false;
        toggle.removeAttribute("aria-busy");
      }
      if (loaded) toggle.click();
    });
  } else {
    import("./instrument.js").then((module) => module.mountInstrument()).catch(() => {});
  }
}

document.addEventListener("astro:page-load", initInstrumentLoader);
