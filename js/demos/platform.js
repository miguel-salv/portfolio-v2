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

// Canvas sized to CSS pixels w x h, backed by a DPR-scaled bitmap (capped for
// 4K/retina fill-rate). returns the element and a context pre-scaled to CSS px.
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

// Runs tick(dtMs) on a fixed-timestep accumulator, decoupled from rAF. returns
// { start, stop }; stop() cancels the pending rAF so the loop goes fully idle.
// Optional render(leftoverMs) fires every frame so visuals can repaint at the
// display's refresh rate; leftoverMs is time since the last tick, for
// interpolating motion between sim steps.
export function createLoop(tick, { fixedStep = 1000 / 60, maxStepsPerFrame = 8, render } = {}) {
  let rafId = null;
  let last = 0;
  let acc = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!last) last = now;
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // Clamp huge gaps (tab backgrounded, etc.)
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
