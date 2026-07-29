const instrument = document.querySelector("[data-instrument]");

if (instrument) {
  const toggle = document.querySelector("[data-instrument-toggle]");
  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener("click", async (event) => {
      event.preventDefault();
      toggle.disabled = true;
      await import("./instrument.js");
      toggle.disabled = false;
      toggle.click();
    }, { once: true });
  } else {
    import("./instrument.js");
  }
}
