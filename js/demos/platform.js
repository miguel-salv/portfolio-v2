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
