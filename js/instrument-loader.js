const instrument = document.querySelector("[data-instrument]");

if (instrument) {
  const toggle = document.querySelector("[data-instrument-toggle]");
  if (toggle) {
    const label = toggle.querySelector(".instrument-toggle-text");
    const initialLabel = label?.textContent || "Try It Yourself";
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
      if (label) label.textContent = "Loading Tuner…";
      try {
        await import("./instrument.js");
        loaded = true;
        if (label) label.textContent = initialLabel;
        if (live) live.textContent = "Interactive tuner loaded.";
      } catch (_) {
        if (label) label.textContent = "Retry Tuner";
        if (live) live.textContent = "Interactive tuner failed to load. Select Retry Tuner to try again.";
      } finally {
        loading = false;
        toggle.disabled = false;
        toggle.removeAttribute("aria-busy");
      }
      if (loaded) toggle.click();
    });
  } else {
    import("./instrument.js").catch(() => {});
  }
}
