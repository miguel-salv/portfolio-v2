import { GESTURE_NONE, GESTURE_SLIDE_UP, GESTURE_SLIDE_DOWN } from "./theme.js";

const SWIPE_MIN_DIST = 18;
const SWIPE_DOMINANCE = 10;

export function createGestureTracker(el, handlers) {
  let sx = 0;
  let sy = 0;
  let lx = 0;
  let ly = 0;
  let down = false;
  let startInteractive = false;
  let axis = null;
  let history = [];

  function isInteractive(node) {
    return node?.closest?.(".kirby-btn, .kirby-stepper-btn, .kirby-ampm-tile, .kirby-actor--live, button, a");
  }

  function onDown(clientX, clientY, target) {
    sx = clientX;
    sy = clientY;
    lx = clientX;
    ly = clientY;
    down = true;
    startInteractive = !!isInteractive(target);
    axis = null;
    history = [{ x: clientX, y: clientY, time: performance.now() }];
    if (!startInteractive && handlers.onStart?.() === false) startInteractive = true;
  }

  function onMove(clientX, clientY) {
    if (!down || startInteractive) return;
    lx = clientX;
    ly = clientY;
    const dx = lx - sx;
    const dy = ly - sy;
    if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_DOMINANCE) {
      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    const now = performance.now();
    history.push({ x: clientX, y: clientY, time: now });
    history = history.filter((sample) => now - sample.time <= 100);
    if (axis === "x") handlers.onDrag?.(dx);
  }

  function onUp() {
    if (!down) return;
    down = false;
    if (startInteractive) return;

    const dx = lx - sx;
    const dy = ly - sy;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const last = history[history.length - 1];
    const first = history[0] || last;
    const elapsed = Math.max(1, (last?.time || 0) - (first?.time || 0));
    const velocityX = last && first ? ((last.x - first.x) / elapsed) * 1000 : 0;

    if (axis === "x") {
      handlers.onRelease?.(dx, velocityX);
    } else if (ady >= SWIPE_MIN_DIST && ady >= adx + SWIPE_DOMINANCE) {
      handlers.onGesture?.(dy < 0 ? GESTURE_SLIDE_UP : GESTURE_SLIDE_DOWN);
    } else {
      handlers.onCancel?.();
    }
  }

  let pointerId = null;
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerId = e.pointerId;
    onDown(e.clientX, e.clientY, e.target);
    if (!startInteractive) el.setPointerCapture?.(pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    onMove(e.clientX, e.clientY);
  });
  el.addEventListener("pointerup", (e) => {
    if (e.pointerId !== pointerId) return;
    onUp();
    pointerId = null;
  });
  el.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== pointerId) return;
    down = false;
    if (!startInteractive) handlers.onCancel?.();
    pointerId = null;
  });

  return { GESTURE_NONE };
}
