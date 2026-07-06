import { GESTURE_NONE, GESTURE_SLIDE_UP, GESTURE_SLIDE_DOWN, GESTURE_SLIDE_LEFT, GESTURE_SLIDE_RIGHT } from "./theme.js";

const SWIPE_MIN_DIST = 18;
const SWIPE_DOMINANCE = 10;
const SWIPE_TIME_MIN = 45;
const SWIPE_TIME_MAX = 520;

export function createGestureTracker(el, onGesture) {
  let sx = 0;
  let sy = 0;
  let lx = 0;
  let ly = 0;
  let down = false;
  let downMs = 0;
  let startInteractive = false;

  function isInteractive(node) {
    return node?.closest?.(".kirby-btn, .kirby-roller, .kirby-roller-item, button, a");
  }

  function onDown(clientX, clientY, target) {
    sx = clientX;
    sy = clientY;
    lx = clientX;
    ly = clientY;
    down = true;
    downMs = Date.now();
    startInteractive = !!isInteractive(target);
  }

  function onMove(clientX, clientY) {
    if (!down) return;
    lx = clientX;
    ly = clientY;
  }

  function onUp() {
    if (!down) return;
    down = false;
    if (startInteractive) return;

    const now = Date.now();
    const dur = now - downMs;
    const dx = lx - sx;
    const dy = ly - sy;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (dur >= SWIPE_TIME_MIN && dur <= SWIPE_TIME_MAX && adx >= SWIPE_MIN_DIST && adx >= ady + SWIPE_DOMINANCE) {
      onGesture(dx < 0 ? GESTURE_SLIDE_LEFT : GESTURE_SLIDE_RIGHT);
    } else if (dur >= SWIPE_TIME_MIN && dur <= SWIPE_TIME_MAX && ady >= SWIPE_MIN_DIST && ady >= adx + SWIPE_DOMINANCE) {
      onGesture(dy < 0 ? GESTURE_SLIDE_UP : GESTURE_SLIDE_DOWN);
    }
  }

  el.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    onDown(t.clientX, t.clientY, e.target);
  }, { passive: true });
  el.addEventListener("touchmove", (e) => {
    const t = e.changedTouches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });
  el.addEventListener("touchend", onUp, { passive: true });

  return { GESTURE_NONE };
}
