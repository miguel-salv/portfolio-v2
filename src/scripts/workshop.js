const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let cleanup = () => {};

function initWorkshop() {
  cleanup();
  const hero = document.querySelector("[data-workshop-hero]");
  if (!hero) return;
  const controller = new AbortController();
  const { signal } = controller;
  let chaseTimer = 0;

  const companion = document.querySelector(".project-card--companion");
  const companionButton = document.querySelector("[data-workshop-companion]");
  const keychain = document.querySelector(".project-card--keychain");
  const chaseButton = document.querySelector("[data-workshop-chase]");
  const status = document.querySelector("[data-workshop-play-status]");
  companionButton?.addEventListener("click", () => {
    const awake = companion?.classList.toggle("is-awake");
    companionButton.setAttribute("aria-pressed", String(Boolean(awake)));
    companionButton.firstChild.textContent = awake ? "Let Kirby sleep" : "Wake up Kirby";
    if (status) status.textContent = awake ? "Kirby's touch display is awake. Open the project to try its apps." : "Kirby's display is asleep.";
  }, { signal });
  const stopChase = () => {
    window.clearTimeout(chaseTimer);
    keychain?.classList.remove("is-chasing");
    chaseButton?.setAttribute("aria-pressed", "false");
    if (chaseButton) chaseButton.firstChild.textContent = "Run the LED chase";
  };
  chaseButton?.addEventListener("click", () => {
    if (keychain?.classList.contains("is-chasing")) { stopChase(); return; }
    keychain?.classList.add("is-chasing");
    chaseButton.setAttribute("aria-pressed", "true");
    chaseButton.firstChild.textContent = "Stop the LED chase";
    if (status) status.textContent = reduced.matches ? "Showing the illuminated LED photo." : "The five LED photos show the chase. It switches off after nine loops.";
    if (!reduced.matches) chaseTimer = window.setTimeout(() => {
      stopChase();
      if (status) status.textContent = "The LED chase has switched off.";
    }, 4500);
  }, { signal });

  const preferencesChanged = () => {
    document.documentElement.toggleAttribute("data-workshop-hidden", document.hidden);
    if (document.hidden || reduced.matches) stopChase();
  };
  document.addEventListener("visibilitychange", preferencesChanged, { signal });
  reduced.addEventListener("change", preferencesChanged, { signal });
  preferencesChanged();
  cleanup = () => {
    document.documentElement.removeAttribute("data-workshop-hidden");
    controller.abort();
    window.clearTimeout(chaseTimer);
  };
}

document.addEventListener("astro:page-load", initWorkshop);
document.addEventListener("astro:before-preparation", () => cleanup());
