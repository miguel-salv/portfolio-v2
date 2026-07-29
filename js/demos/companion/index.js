import { createClockApp } from "./app-clock.js";
import { createWeatherApp } from "./app-weather.js";
import { createStopwatchApp } from "./app-stopwatch.js";
import { createGameApp } from "./app-game.js";
import { createGestureTracker } from "./gesture.js";
import { mountMuteToggle, playUiSwipe } from "./audio.js";
import {
  GESTURE_SLIDE_LEFT, GESTURE_SLIDE_RIGHT,
  GESTURE_SLIDE_UP, GESTURE_SLIDE_DOWN,
  W,
} from "./theme.js";
import { el } from "./components/ui.js";

export function mount(frame) {
  // Prefetch Montserrat; DOM labels reflow and the canvas redraws once it loads,
  // and canvas text can't be re-rendered retroactively otherwise
  if (document.fonts && document.fonts.load) {
    document.fonts.load("600 16px Montserrat");
    document.fonts.load("500 48px Montserrat");
  }

  const viewport = el("div", "kirby-viewport");
  const track = el("div", "kirby-track");

  const liveRegion = el("p", "sr-only");
  liveRegion.setAttribute("role", "status");
  liveRegion.setAttribute("aria-live", "polite");

  const clock = createClockApp();
  const weather = createWeatherApp();
  const stopwatch = createStopwatchApp();
  const game = createGameApp();

  const apps = [clock, weather, stopwatch, game];
  const appNames = ["Clock", "Weather", "Stopwatch", "Star Catcher"];
  const screens = apps.map((a) => {
    const wrap = el("div", "kirby-slide");
    wrap.appendChild(a.el);
    track.appendChild(wrap);
    return wrap;
  });

  let idx = 0;
  let animating = false;
  let transitionTimer = 0;

  function goTo(next, direction = Math.sign(next - idx)) {
    if (animating || next === idx) return;
    animating = true;
    playUiSwipe();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wrapsForward = idx === apps.length - 1 && next === 0 && direction > 0;
    const wrapsBackward = idx === 0 && next === apps.length - 1 && direction < 0;
    let restore = null;

    if (wrapsForward) {
      track.appendChild(screens[0]);
      track.style.transition = "none";
      track.style.transform = `translateX(${-(idx - 1) * 320}px)`;
      restore = () => track.insertBefore(screens[0], track.firstChild);
    } else if (wrapsBackward) {
      track.insertBefore(screens[apps.length - 1], track.firstChild);
      track.style.transition = "none";
      track.style.transform = "translateX(-320px)";
      restore = () => track.appendChild(screens[apps.length - 1]);
    }

    void track.offsetWidth;
    track.style.transition = reduced ? "none" : "transform 160ms ease-in";
    const targetX = wrapsForward ? -(apps.length - 1) * 320 : wrapsBackward ? 0 : -next * 320;
    track.style.transform = `translateX(${targetX}px)`;
    screens[idx].classList.remove("kirby-slide-active");
    screens[next].classList.add("kirby-slide-active");
    const done = (event) => {
      if (event && (event.target !== track || event.propertyName !== "transform")) return;
      window.clearTimeout(transitionTimer);
      track.removeEventListener("transitionend", done);
      if (restore) {
        track.style.transition = "none";
        restore();
        track.style.transform = `translateX(${-next * 320}px)`;
        void track.offsetWidth;
      }
      animating = false;
      idx = next;
      liveRegion.textContent = `${appNames[next]} app`;
    };
    if (reduced) done();
    else {
      track.addEventListener("transitionend", done);
      transitionTimer = window.setTimeout(done, 260);
    }
  }

  screens[0].classList.add("kirby-slide-active");
  viewport.appendChild(track);
  frame.appendChild(viewport);
  frame.appendChild(liveRegion);

  mountMuteToggle(frame);

  function handleGesture(gesture) {
    if (gesture === GESTURE_SLIDE_LEFT) {
      if (idx === 3 && game.isRunning()) return;
      goTo((idx + 1) % 4, 1);
    } else if (gesture === GESTURE_SLIDE_RIGHT) {
      if (idx === 3 && game.isRunning()) return;
      goTo((idx + 3) % 4, -1);
    } else if (idx === 0) {
      clock.handleSwipe(gesture);
    } else if (idx === 1) {
      weather.handleSwipe(gesture);
    } else if (idx === 2) {
      stopwatch.handleSwipe(gesture);
    }
  }

  createGestureTracker(viewport, handleGesture);

  function pointerToLogical(clientX) {
    const rect = viewport.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  viewport.addEventListener("pointerdown", (e) => {
    if (idx !== 3 || !game.isRunning()) return;
    game.handleTouch(pointerToLogical(e.clientX));
  });
  viewport.addEventListener("pointermove", (e) => {
    if (idx !== 3 || !game.isRunning() || !(e.buttons & 1)) return;
    game.handleTouch(pointerToLogical(e.clientX));
  });

  frame.addEventListener("keydown", (e) => {
    let gesture = null;
    if (e.key === "ArrowRight") gesture = GESTURE_SLIDE_LEFT;
    else if (e.key === "ArrowLeft") gesture = GESTURE_SLIDE_RIGHT;
    else if (e.key === "ArrowUp") gesture = GESTURE_SLIDE_UP;
    else if (e.key === "ArrowDown") gesture = GESTURE_SLIDE_DOWN;
    if (gesture == null) return;
    e.preventDefault();
    if (idx === 3 && game.isRunning()) {
      if (e.key === "ArrowLeft") game.handleTouch(48);
      else if (e.key === "ArrowRight") game.handleTouch(W - 48);
      return;
    }
    handleGesture(gesture);
  });

  return {
    pause() {
      clock.pause?.();
      stopwatch.pause?.();
      game.pause?.();
    },
    resume() {
      clock.resume?.();
      stopwatch.resume?.();
      game.resume?.();
    },
    destroy() {
      window.clearTimeout(transitionTimer);
      clock.pause?.();
      stopwatch.pause?.();
      game.pause?.();
    },
  };
}
