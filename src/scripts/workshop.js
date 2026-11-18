import { setupHornetSticker } from "./hornet-sticker.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const boardTurnFrames = Array.from({ length: 21 }, (_, frame) => ({
  transform: `scaleX(${Math.max(.22, Math.abs(Math.cos(Math.PI * frame / 20)))})`,
}));
const boardFadeFrames = [
  { opacity: 0, offset: 0 },
  { opacity: 0, offset: .43 },
  { opacity: 1, offset: .57 },
  { opacity: 1, offset: 1 },
];
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
  const board = keychain?.querySelector(".keychain-board");
  const boardFront = keychain?.querySelector(".keychain-board-front");
  const boardBack = keychain?.querySelector(".keychain-board-back");
  const status = document.querySelector("[data-workshop-play-status]");
  let boardTurn;
  setupHornetSticker(document.querySelector(".portrait-hornet"), { reduced, signal });
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
  const finishBoardTurn = () => {
    boardTurn?.forEach(animation => animation.cancel());
    boardTurn = null;
    keychain?.classList.remove("is-turning");
  };
  const showBoardBack = (show) => {
    if (keychain && keychain.classList.contains("is-flipped") !== show && !reduced.matches && board?.animate && boardBack?.animate) {
      if (boardTurn) {
        boardTurn.forEach(animation => animation.reverse());
      } else {
        const timing = { duration: 480, easing: "cubic-bezier(.45, 0, .55, 1)", fill: "both",
          direction: show ? "normal" : "reverse" };
        // Transform and opacity can run on the compositor during page work.
        const turn = [board.animate(boardTurnFrames, timing), boardBack.animate(boardFadeFrames, timing)];
        boardTurn = turn;
        keychain.classList.add("is-turning");
        turn[0].onfinish = () => {
          if (boardTurn === turn && turn[0].playState === "finished") finishBoardTurn();
        };
      }
    }
    keychain?.classList.toggle("is-flipped", show);
    flipButton?.setAttribute("aria-pressed", String(show));
    boardFront?.setAttribute("aria-hidden", String(show));
    boardBack?.setAttribute("aria-hidden", String(!show));
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
    if (document.hidden || reduced.matches) {
      stopChase();
      finishBoardTurn();
    }
  };
  document.addEventListener("visibilitychange", preferencesChanged, { signal });
  reduced.addEventListener("change", preferencesChanged, { signal });
  preferencesChanged();
  document.documentElement.classList.add("workshop-ready");
  document.addEventListener("astro:after-swap", () => {
    if (!hero.isConnected) cleanup();
  }, { signal });
  cleanup = () => {
    cleanup = () => {};
    document.documentElement.classList.remove("workshop-ready");
    document.documentElement.removeAttribute("data-workshop-hidden");
    controller.abort();
    finishBoardTurn();
    window.clearTimeout(chaseTimer);
  };
}

document.addEventListener("astro:page-load", initWorkshop);
