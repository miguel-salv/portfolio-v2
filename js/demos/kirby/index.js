import { createClockApp } from "./app-clock.js";
import { createWeatherApp } from "./app-weather.js";
import { createStopwatchApp } from "./app-stopwatch.js";
import { createGameApp } from "./app-game.js";
import { createGestureTracker } from "./gesture.js";
import { isTouchPrimary } from "../platform.js";
import {
  GESTURE_SLIDE_LEFT, GESTURE_SLIDE_RIGHT,
  GESTURE_SLIDE_UP, GESTURE_SLIDE_DOWN,
} from "./theme.js";
import { el } from "./components/ui.js";

export function mount(frame) {
  const viewport = el("div", "kirby-viewport");
  const track = el("div", "kirby-track");

  const clock = createClockApp();
  const weather = createWeatherApp();
  const stopwatch = createStopwatchApp();
  const game = createGameApp();

  const apps = [clock, weather, stopwatch, game];
  const screens = apps.map((a) => {
    const wrap = el("div", "kirby-slide");
    wrap.appendChild(a.el);
    track.appendChild(wrap);
    return wrap;
  });

  let idx = 0;
  let animating = false;

  function goTo(next) {
    if (animating || next === idx) return;
    animating = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.style.transition = reduced ? "none" : "transform 160ms ease-in";
    track.style.transform = `translateX(${-next * 320}px)`;
    screens[idx].classList.remove("kirby-slide-active");
    screens[next].classList.add("kirby-slide-active");
    const done = () => {
      animating = false;
      idx = next;
      track.removeEventListener("transitionend", done);
    };
    if (reduced) done();
    else track.addEventListener("transitionend", done);
  }

  screens[0].classList.add("kirby-slide-active");
  viewport.appendChild(track);
  frame.appendChild(viewport);

  function handleGesture(gesture) {
    if (gesture === GESTURE_SLIDE_LEFT) {
      if (idx === 3 && game.isRunning()) return;
      goTo((idx + 1) % 4);
    } else if (gesture === GESTURE_SLIDE_RIGHT) {
      if (idx === 3 && game.isRunning()) return;
      goTo((idx + 3) % 4);
    } else if (idx === 0) {
      clock.handleSwipe(gesture);
    } else if (idx === 1) {
      weather.handleSwipe(gesture);
    } else if (idx === 2) {
      stopwatch.handleSwipe(gesture);
    }
  }

  if (isTouchPrimary()) {
    createGestureTracker(viewport, handleGesture);
  } else {
    frame.addEventListener("keydown", (e) => {
      let gesture = null;
      if (e.key === "ArrowRight") gesture = GESTURE_SLIDE_LEFT;
      else if (e.key === "ArrowLeft") gesture = GESTURE_SLIDE_RIGHT;
      else if (e.key === "ArrowUp") gesture = GESTURE_SLIDE_UP;
      else if (e.key === "ArrowDown") gesture = GESTURE_SLIDE_DOWN;
      if (gesture == null) return;
      e.preventDefault();
      handleGesture(gesture);
    });
  }
}
