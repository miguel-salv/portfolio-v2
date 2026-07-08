const TOUCH_MQ = window.matchMedia("(hover: none) and (pointer: coarse)");

export function isTouchPrimary() {
  return TOUCH_MQ.matches;
}

export function applyDemoHint(figure) {
  const cap = figure.querySelector("figcaption");
  if (!cap) return;

  const hint = isTouchPrimary()
    ? cap.dataset.hintTouch
    : cap.dataset.hintPointer;
  if (!hint) return;

  cap.textContent = hint;
  const frame = figure.querySelector(".hardware-demo-frame");
  if (frame) frame.setAttribute("aria-label", hint);
}

/**
 * Creates a canvas sized to CSS pixels `w`x`h`, backed by a device-pixel-ratio
 * scaled bitmap (capped so 4K/retina displays don't blow up fill-rate cost).
 * Returns the canvas element and a 2D context pre-scaled to CSS pixel units.
 */
export function createCanvas(frame, w, h, { dprCap = 2 } = {}) {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  frame.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx, width: w, height: h, dpr };
}

/**
 * Runs `tick(dtMs)` on a fixed-timestep accumulator, decoupled from the
 * variable-rate requestAnimationFrame callback. Returns `{ start, stop }`;
 * `stop()` cancels the pending RAF so the loop truly goes idle (e.g. when a
 * demo scrolls off-screen) instead of merely skipping work every frame.
 *
 * An optional `render(leftoverMs)` callback fires on *every* animation
 * frame -- even frames where no fixed tick ran -- so visuals can repaint at
 * the display's native refresh rate instead of `fixedStep`'s (slower, and
 * usually non-integer-divisor) simulation rate. `leftoverMs` is the
 * accumulated time since the last tick, handy for interpolating/extrapolating
 * motion between simulation steps so animation reads smoothly on any
 * refresh rate instead of juddering.
 */
export function createLoop(tick, { fixedStep = 1000 / 60, maxStepsPerFrame = 8, render } = {}) {
  let rafId = null;
  let last = 0;
  let acc = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!last) last = now;
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // clamp huge gaps (tab backgrounded, etc.)
    acc += dt;

    let steps = 0;
    while (acc >= fixedStep && steps < maxStepsPerFrame) {
      tick(fixedStep);
      acc -= fixedStep;
      steps++;
    }

    if (render) render(acc);
  }

  return {
    start() {
      if (rafId != null) return;
      last = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (rafId == null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    },
    get running() {
      return rafId != null;
    },
  };
}
