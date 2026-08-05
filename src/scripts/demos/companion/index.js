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
  let offset = 0;
  let velocity = 0;
  let targetOffset = 0;
  let springRaf = 0;
  let lastFrame = 0;
  let dragStartOffset = 0;
  let pendingIdx = 0;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

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
    springRaf = 0;
    idx = pendingIdx;
    offset = 0;
    targetOffset = 0;
    velocity = 0;
    screens.forEach((screen, screenIndex) => screen.classList.toggle("kirby-slide-active", screenIndex === idx));
    renderSlides();
    liveRegion.textContent = `${appNames[idx]} app`;
  }

  function commitPendingPosition() {
    if (pendingIdx === idx) return;
    offset += targetOffset < 0 ? W : -W;
    idx = pendingIdx;
    targetOffset = 0;
    screens.forEach((screen, screenIndex) => screen.classList.toggle("kirby-slide-active", screenIndex === idx));
    renderSlides();
  }

  function springFrame(now) {
    const dt = Math.min((now - lastFrame) / 1000 || 1 / 60, 1 / 30);
    lastFrame = now;
    const acceleration = (targetOffset - offset) * 240 - velocity * 30;
    velocity += acceleration * dt;
    offset += velocity * dt;
    renderSlides();
    if (Math.abs(targetOffset - offset) < 0.2 && Math.abs(velocity) < 2) settle();
    else springRaf = requestAnimationFrame(springFrame);
  }

  function startSpring(initialVelocity = velocity) {
    cancelAnimationFrame(springRaf);
    velocity = initialVelocity;
    if (motionQuery.matches) {
      settle();
      return;
    }
    lastFrame = performance.now();
    springRaf = requestAnimationFrame(springFrame);
  }

  function goTo(next, initialVelocity = velocity) {
    const direction = Math.max(-1, Math.min(1, next - idx));
    next = ((next % apps.length) + apps.length) % apps.length;
    pendingIdx = next;
    if (!direction) {
      targetOffset = 0;
      startSpring(initialVelocity);
      return;
    }
    playUiSwipe();
    targetOffset = -direction * W;
    startSpring(initialVelocity);
  }

  screens[0].classList.add("kirby-slide-active");
  renderSlides();
  viewport.appendChild(track);
  frame.appendChild(viewport);
  frame.appendChild(liveRegion);

  mountMuteToggle(frame);

  function handleGesture(gesture) {
    if (gesture === GESTURE_SLIDE_LEFT) {
      if (idx === 3 && game.isRunning()) return;
      goTo(idx + 1);
    } else if (gesture === GESTURE_SLIDE_RIGHT) {
      if (idx === 3 && game.isRunning()) return;
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
      if (idx === 3 && game.isRunning()) return false;
      cancelAnimationFrame(springRaf);
      springRaf = 0;
      commitPendingPosition();
      dragStartOffset = offset;
      velocity = 0;
      return true;
    },
    onDrag(deltaX) {
      offset = Math.max(-W, Math.min(W, dragStartOffset + deltaX));
      renderSlides();
    },
    onRelease(deltaX, releaseVelocity) {
      const projectedOffset = offset + releaseVelocity * 0.22;
      let direction = Math.max(-1, Math.min(1, Math.round(-projectedOffset / W)));
      if (Math.abs(deltaX) < 18 && Math.abs(releaseVelocity) < 180) direction = 0;
      goTo(idx + direction, releaseVelocity);
    },
    onCancel() {
      pendingIdx = idx;
      targetOffset = 0;
      startSpring(0);
    },
    onGesture(gesture) {
      pendingIdx = idx;
      targetOffset = 0;
      startSpring(0);
      handleGesture(gesture);
    },
  });

  motionQuery.addEventListener?.("change", (event) => {
    if (!event.matches) return;
    cancelAnimationFrame(springRaf);
    settle();
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
      cancelAnimationFrame(springRaf);
      clock.pause?.();
      stopwatch.pause?.();
      game.pause?.();
    },
  };
}
