export const PHOS_GOLD = "#ffe566";
export const PHOS_PINK = "#ff8ec8";
export const PHOS_CREAM = "#ffecd6";
export const PHOS_FEET = "#dc3050";
export const PHOS_INK = "#09071e";
export const PHOS_PANEL = "#12101c";
export const PHOS_BRONZE = "#5c3a20";
export const PHOS_PRESSED = "#dc4678";

export const BTN_PINK = PHOS_PINK;
export const BTN_GREEN = PHOS_PINK;
export const BTN_ORANGE = PHOS_GOLD;
export const BTN_RED = PHOS_FEET;
export const BTN_GRAY = PHOS_BRONZE;

export const W = 320;
export const H = 240;
export const PAGE_MS = 160;
export const STRIP_GAP = 4;
export const DIGIT_W = 36;
export const DIGIT_H = 64;
export const COLON_W = 14;
export const DOT_W = 14;
export const STAGE_BTN_Y = 140;
export const STAGE_BTN_H = 32;
export const SHEET_BTN_Y = 192;

export const GESTURE_NONE = 0;
export const GESTURE_SLIDE_UP = 1;
export const GESTURE_SLIDE_DOWN = 2;
export const GESTURE_SLIDE_LEFT = 3;
export const GESTURE_SLIDE_RIGHT = 4;

export const ASSET = "/assets/demos/companion";

export function asset(name) {
  return `${ASSET}/${name}`;
}

export function mixBlack(hex, blackAmt) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const keep = 1 - blackAmt;
  const to = (c) => Math.round(c * keep).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function btnFill(bg) {
  return `linear-gradient(180deg, ${bg}, ${mixBlack(bg, 90 / 255)})`;
}

export function btnPressed(bg) {
  return `linear-gradient(180deg, ${mixBlack(bg, 80 / 255)}, ${mixBlack(bg, 40 / 255)})`;
}

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function easeInCubic(t) {
  return t * t * t;
}

export function easeInOutSine(t) {
  return (1 - Math.cos(Math.PI * t)) / 2;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
