import { createClockApp } from "./app-clock.js";
import { createWeatherApp } from "./app-weather.js";
import { createStopwatchApp } from "./app-stopwatch.js";
import { createGameApp } from "./app-game.js";
import { createGestureTracker } from "./gesture.js";
import { mountMuteToggle, playUiSwipe } from "./audio.js";
import {
  GESTURE_SLIDE_DOWN, GESTURE_SLIDE_LEFT, GESTURE_SLIDE_RIGHT, GESTURE_SLIDE_UP,
  PAGE_MS, W, easeOutCubic, prefersReducedMotion,
} from "./theme.js";
import { el } from "./components/ui.js";

export function mount(frame) {
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
  let offset = 0;
  let animRaf = 0;
  let dragStartOffset = 0;
  let pendingIdx = 0;

  function relativeSlot(screenIndex) {
    let slot = screenIndex - idx;
    if (slot > apps.length / 2) slot -= apps.length;
    if (slot < -apps.length / 2) slot += apps.length;
    if (slot === apps.length / 2) slot = offset < 0 ? slot : -slot;
    return slot;
  }

  function renderSlides() {
    screens.forEach((screen, screenIndex) => {
      screen.style.transform = `translate3d(${relativeSlot(screenIndex) * W + offset}px, 0, 0)`;
    });
  }

  function settle() {
    animRaf = 0;
    const prev = idx;
    idx = pendingIdx;
    offset = 0;
    screens.forEach((screen, screenIndex) => {
      const on = screenIndex === idx;
      screen.classList.toggle("kirby-slide-active", on);
      screen.setAttribute("aria-hidden", on ? "false" : "true");
    });
    renderSlides();
    liveRegion.textContent = `${appNames[idx]} app`;
    if (idx === 0 && prev !== 0) clock.hello?.();
  }

  function roomDir(from, to) {
    if (from === to) return 0;
    const raw = to - from;
    if (raw > 2) return -1;
    if (raw < -2) return 1;
    return Math.sign(raw);
  }

  function snapTo(next, playSound = true) {
    next = ((next % apps.length) + apps.length) % apps.length;
    pendingIdx = next;
    const target = -roomDir(idx, next) * W;
    if (next !== idx && playSound) playUiSwipe();
    if (prefersReducedMotion() || Math.abs(offset - target) < 0.5) {
      settle();
      return;
    }
    const start = offset;
    const t0 = performance.now();
    cancelAnimationFrame(animRaf);
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / PAGE_MS);
      offset = start + (target - start) * easeOutCubic(t);
      if (t >= 1) {
        if (pendingIdx !== idx && target !== 0) {
          offset += target < 0 ? W : -W;
          idx = pendingIdx;
        }
        settle();
        return;
      }
      renderSlides();
      animRaf = requestAnimationFrame(tick);
    };
    animRaf = requestAnimationFrame(tick);
  }

  function goTo(next) {
    snapTo(next, next !== idx);
  }

  function canSwipeRoom() {
    return apps[idx].isLowerView?.() !== false && !game.isRunning();
  }

  clock.setOnFired?.(() => goTo(0));
  stopwatch.setOnFired?.(() => goTo(2));

  screens.forEach((screen, screenIndex) => {
    const on = screenIndex === 0;
    screen.classList.toggle("kirby-slide-active", on);
    screen.setAttribute("aria-hidden", on ? "false" : "true");
  });
  renderSlides();
  viewport.appendChild(track);
  frame.appendChild(viewport);
  frame.appendChild(liveRegion);
  const caption = frame.closest("figure")?.querySelector("figcaption");
  mountMuteToggle(caption || frame.parentElement || frame);

  function handleGesture(gesture) {
    if (gesture === GESTURE_SLIDE_LEFT) {
      if (!canSwipeRoom()) return;
      goTo(idx + 1);
    } else if (gesture === GESTURE_SLIDE_RIGHT) {
      if (!canSwipeRoom()) return;
      goTo(idx - 1);
    } else if (idx === 0) {
      clock.handleSwipe(gesture);
    } else if (idx === 1) {
      weather.handleSwipe(gesture);
    } else if (idx === 2) {
      stopwatch.handleSwipe(gesture);
    }
  }

  createGestureTracker(viewport, {
    onStart() {
      if (!canSwipeRoom()) return false;
      cancelAnimationFrame(animRaf);
      animRaf = 0;
      dragStartOffset = offset;
      return true;
    },
    onDrag(deltaX) {
      offset = Math.max(-W, Math.min(W, dragStartOffset + deltaX));
      renderSlides();
    },
    onRelease(deltaX, releaseVelocity) {
      const projected = offset + releaseVelocity * 0.12;
      let direction = Math.max(-1, Math.min(1, Math.round(-projected / W)));
      if (Math.abs(deltaX) < 18 && Math.abs(releaseVelocity) < 180) direction = 0;
      goTo(idx + direction);
    },
    onCancel() {
      pendingIdx = idx;
      snapTo(idx, false);
    },
    onGesture(gesture) {
      pendingIdx = idx;
      snapTo(idx, false);
      handleGesture(gesture);
    },
  });

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
      cancelAnimationFrame(animRaf);
      clock.destroy?.();
      stopwatch.pause?.();
      game.destroy?.();
    },
  };
}
