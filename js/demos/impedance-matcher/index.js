import { createState, S_HOME, S_MENU, S_METRICS, MODE_AUTO, DISPLAY_THROTTLE_AUTO_HOME_MS } from "./state.js";
import { createDisplay } from "./display.js";
import { matchingTick } from "./matcher.js";
import { handleInput, bindInput, applyTouchHit } from "./input.js";
import { hitTestTouch } from "./display.js";

export function mount(frame) {
  const canvas = document.createElement("canvas");
  frame.appendChild(canvas);

  const state = createState();
  const display = createDisplay(canvas);

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
  }

  bindInput(frame, canvas, onInput, {
    isVerticalNav: () => state.state === S_MENU && !state.menuEditingMotor,
    resolveTouch: (lx, ly) => hitTestTouch(state, lx, ly),
  });

  function tick() {
    matchingTick(state);
    if (shouldRedraw(false)) {
      display.render(state);
      state.lastDisplayMs = Date.now();
    }
    requestAnimationFrame(tick);
  }

  display.render(state);
  state.lastDisplayMs = Date.now();
  requestAnimationFrame(tick);
}
