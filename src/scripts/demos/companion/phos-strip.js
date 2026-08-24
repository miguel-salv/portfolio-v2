import { spr } from "./components/ui.js";
import { COLON_W, DIGIT_W, DOT_W, STRIP_GAP, W, asset } from "./theme.js";
import { pingPong } from "./motion.js";
import { prefersReducedMotion } from "./theme.js";

const GLYPH = {
  0: "digit-0.png",
  1: "digit-1.png",
  2: "digit-2.png",
  3: "digit-3.png",
  4: "digit-4.png",
  5: "digit-5.png",
  6: "digit-6.png",
  7: "digit-7.png",
  8: "digit-8.png",
  9: "digit-9.png",
  "-": "digit-dash.png",
  ":": "digit-colon.png",
  ".": "digit-dot.png",
};

export function charW(c) {
  if (c === ":") return COLON_W;
  if (c === ".") return DOT_W;
  return DIGIT_W;
}

export function stripWidth(text, gap = STRIP_GAP) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    if (i) w += gap;
    w += charW(text[i]);
  }
  return w;
}

export function createStrip(parent, x, y, init, gap = STRIP_GAP) {
  const imgs = [];
  let cx = x;
  for (let i = 0; i < init.length; i++) {
    const c = init[i];
    const src = GLYPH[c] || GLYPH["-"];
    const img = spr(src, cx, y, charW(c === " " ? "-" : c), 64);
    if (c === " ") img.classList.add("kirby-hidden");
    parent.appendChild(img);
    imgs.push(img);
    cx += charW(c) + gap;
  }

  function set(text) {
    for (let i = 0; i < imgs.length; i++) {
      const c = text[i];
      if (c == null) break;
      if (c === " ") {
        imgs[i].classList.add("kirby-hidden");
        continue;
      }
      imgs[i].classList.remove("kirby-hidden");
      imgs[i].src = asset(GLYPH[c] || GLYPH["-"]);
    }
  }

  return { imgs, set, n: imgs.length };
}

export function createStripCentered(parent, y, init, gap = STRIP_GAP) {
  return createStrip(parent, Math.floor((W - stripWidth(init, gap)) / 2), y, init, gap);
}

export function pulseColon(img) {
  if (!img || prefersReducedMotion()) return;
  pingPong({
    key: `colon-${Math.random().toString(36).slice(2, 8)}`,
    from: 70 / 255,
    to: 1,
    ms: 520,
    onUpdate: (v) => { img.style.opacity = String(v); },
  });
}
