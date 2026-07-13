import { createState, S_HOME, S_MENU, S_METRICS, MODE_AUTO, DISPLAY_THROTTLE_AUTO_HOME_MS } from "./state.js";
import { createDisplay } from "./display.js";
import { matchingTick } from "./matcher.js";
import { handleInput, bindInput, applyTouchHit } from "./input.js";
import { hitTestTouch } from "./display.js";

function stateSummary(state) {
  const screen =
    state.state === S_MENU ? "menu" :
    state.state === S_METRICS ? "metrics" :
    "home";
  const mode = state.opMode === MODE_AUTO ? "auto" : "manual";
  const vswr = Number.isFinite(state.lastVSWR) ? state.lastVSWR.toFixed(2) : "—";
  const tx = state.radioTX ? "on" : "off";
  return `OLED ${screen}, ${mode} mode, VSWR ${vswr}, transmit ${tx}.`;
}

export function mount(frame) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Interactive OLED impedance matcher interface");
  frame.appendChild(canvas);

  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  frame.appendChild(live);

  const state = createState();
  const display = createDisplay(canvas);
  let lastAnnouncement = "";

  function announce(force = false) {
    const next = stateSummary(state);
    if (!force && next === lastAnnouncement) return;
    lastAnnouncement = next;
    live.textContent = next;
  }

  function shouldRedraw(userInput) {
    const throttle = state.opMode === MODE_AUTO && (state.state === S_HOME || state.state === S_METRICS);
    const slowDue = !state.lastDisplayMs || Date.now() - state.lastDisplayMs >= DISPLAY_THROTTLE_AUTO_HOME_MS;
    return userInput || !throttle || slowDue;
  }

  function onInput(deltaOrHit, pressed) {
    if (typeof deltaOrHit === "object" && deltaOrHit !== null) {
      applyTouchHit(state, deltaOrHit);
    } else {
      handleInput(state, deltaOrHit, pressed);
    }
    if (shouldRedraw(true)) {
      display.render(state);
      state.lastDisplayMs = Date.now();
    }
    announce();
  }

  bindInput(frame, canvas, onInput, {
    isVerticalNav: () => state.state === S_MENU && !state.menuEditingMotor,
    resolveTouch: (lx, ly) => hitTestTouch(state, lx, ly),
  });

  let rafId = null;

  function tick() {
    matchingTick(state);
    if (shouldRedraw(false)) {
      display.render(state);
      state.lastDisplayMs = Date.now();
      announce();
    }
    rafId = requestAnimationFrame(tick);
  }

  display.render(state);
  state.lastDisplayMs = Date.now();
  announce(true);
  rafId = requestAnimationFrame(tick);

  return {
    pause() {
      if (rafId == null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    },
    resume() {
      if (rafId != null) return;
      rafId = requestAnimationFrame(tick);
    },
  };
}
