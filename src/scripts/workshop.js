const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let cleanup = () => {};

function initWorkshop() {
  cleanup();
  const hero = document.querySelector("[data-workshop-hero]");
  if (!hero) return;
  const controller = new AbortController();
  const { signal } = controller;
  let chaseTimer = 0;

  // Astro can reinitialize the same page after an anchor jump or cancelled swap.
  if (!hero.dataset.greeting) {
    try {
      hero.dataset.greeting = sessionStorage.getItem("portfolio-home-seen") ? "returning" : "first";
      sessionStorage.setItem("portfolio-home-seen", "1");
    } catch {
      hero.dataset.greeting = "first";
    }
  }
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) hero.dataset.greeting = "returning";
  }, { signal });

  const companion = document.querySelector(".project-card--companion");
  const companionButton = document.querySelector("[data-workshop-companion]");
  const keychain = document.querySelector(".project-card--keychain");
  const chaseButton = document.querySelector("[data-workshop-chase]");
  const flipButton = document.querySelector("[data-workshop-flip]");
  const boardSwitch = document.querySelector("[data-workshop-switch]");
  const boardArt = keychain?.querySelector(".keychain-art");
  const hornetButton = document.querySelector(".portrait-hornet");
  const hornetArt = hornetButton?.querySelector("svg");
  const status = document.querySelector("[data-workshop-play-status]");
  let boardTurn;
  let hornetHop;
  if (hornetArt?.animate) {
    hornetButton.disabled = false;
    hornetButton.addEventListener("click", () => {
      hornetHop?.cancel();
      if (reduced.matches) {
        hornetHop = hornetArt.animate({ filter: "drop-shadow(0 0 4px #fff3bf)" }, { duration: 280 });
        return;
      }
      hornetHop = hornetArt.animate([
        { transform: "none", easing: "ease-in" },
        { transform: "scale(1.06, .9)", offset: .14, easing: "ease-out" },
        { transform: "translate(-12px, -24px) rotate(-15deg)", offset: .48, easing: "ease-in" },
        { transform: "scale(1.08, .91)", offset: .79, easing: "ease-out" },
        { transform: "none" },
      ], { duration: 360 });
    }, { signal });
  }
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
  const showBoardBack = (show) => {
    const changed = keychain?.classList.contains("is-flipped") !== show;
    keychain?.classList.toggle("is-flipped", show);
    flipButton?.setAttribute("aria-pressed", String(show));
    if (changed && !reduced.matches && boardArt?.animate) {
      boardTurn?.cancel();
      boardTurn = boardArt.animate(
        [{ transform: `perspective(820px) rotateY(${show ? -62 : 62}deg)` }, { transform: "none" }],
        { duration: 400, easing: "cubic-bezier(.17,.73,.24,1)" },
      );
    }
  };
  if (keychain && flipButton) {
    flipButton.hidden = false;
    flipButton.addEventListener("click", () => {
      const show = !keychain.classList.contains("is-flipped");
      stopChase();
      showBoardBack(show);
      if (status) status.textContent = show ? "Showing the back of the Kirby circuit board." : "Showing the front of the Kirby circuit board.";
    }, { signal });
  }
  chaseButton?.addEventListener("click", () => {
    if (keychain?.classList.contains("is-chasing")) { stopChase(); return; }
    showBoardBack(false);
    keychain?.classList.add("is-chasing");
    chaseButton.setAttribute("aria-pressed", "true");
    chaseButton.firstChild.textContent = "Stop the LED chase";
    if (status) status.textContent = reduced.matches ? "Showing the illuminated LED photo." : "The five LED photos show the chase. It switches off after nine loops.";
    if (!reduced.matches) chaseTimer = window.setTimeout(() => {
      stopChase();
      if (status) status.textContent = "The LED chase has switched off.";
    }, 4500);
  }, { signal });
  boardSwitch?.addEventListener("click", () => {
    const restoreFocus = document.activeElement === boardSwitch;
    chaseButton?.click();
    if (restoreFocus) flipButton?.focus({ preventScroll: true });
  }, { signal });

  const preferencesChanged = () => {
    document.documentElement.toggleAttribute("data-workshop-hidden", document.hidden);
    if (document.hidden || reduced.matches) stopChase();
    if (reduced.matches) {
      boardTurn?.cancel();
      hornetHop?.cancel();
    }
  };
  document.addEventListener("visibilitychange", preferencesChanged, { signal });
  reduced.addEventListener("change", preferencesChanged, { signal });
  preferencesChanged();
  document.documentElement.classList.add("workshop-ready");
  cleanup = () => {
    document.documentElement.classList.remove("workshop-ready");
    document.documentElement.removeAttribute("data-workshop-hidden");
    controller.abort();
    boardTurn?.cancel();
    hornetHop?.cancel();
    window.clearTimeout(chaseTimer);
  };
}

document.addEventListener("astro:page-load", initWorkshop);
document.addEventListener("astro:before-preparation", () => cleanup());
