import { playUiClick } from "../audio.js";
import { paintPhosCanvas, phosMeasure } from "../fonts.js";
import {
  PHOS_CREAM, PHOS_GOLD, PHOS_INK, W,
  asset, btnFill, btnPressed,
  easeInOutSine, prefersReducedMotion,
} from "../theme.js";
import { cancelAnim, pingPong } from "../motion.js";

export function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function spr(src, x, y, w, h) {
  const img = el("img", "kirby-spr");
  img.src = asset(src);
  img.alt = "";
  img.draggable = false;
  img.width = w;
  img.height = h;
  img.style.left = `${x}px`;
  img.style.top = `${y}px`;
  return img;
}

export function label(parent, text, opts = {}) {
  const node = el("canvas", "kirby-label");
  const size = opts.size ?? 8;
  const letterSpace = opts.letterSpace ?? (size === 8 ? 1 : 0);
  let color = opts.color ?? PHOS_CREAM;
  let current = text;
  const paint = (value) => {
    current = value;
    paintPhosCanvas(node, value, color, {
      size,
      letterSpace,
      lineSpace: opts.lineSpace ?? 2,
      align: opts.align,
      w: opts.w,
    });
  };
  paint(text);
  if (opts.x != null) node.style.left = `${opts.x}px`;
  if (opts.y != null) node.style.top = `${opts.y}px`;
  if (opts.right != null) {
    const m = phosMeasure(text, size, letterSpace, opts.lineSpace ?? 2);
    const width = opts.w ?? m.w;
    node.style.left = `${W - opts.right - width}px`;
  }
  if (opts.centerX) {
    const m = phosMeasure(text, size, letterSpace, opts.lineSpace ?? 2);
    const width = opts.w ?? m.w;
    node.style.left = `${Math.floor((W - width) / 2)}px`;
  }
  parent.appendChild(node);
  node.setText = (value) => {
    paint(value);
    if (opts.centerX) {
      const m = phosMeasure(value, size, letterSpace, opts.lineSpace ?? 2);
      const width = opts.w ?? m.w;
      node.style.left = `${Math.floor((W - width) / 2)}px`;
    }
    if (opts.right != null) {
      const m = phosMeasure(value, size, letterSpace, opts.lineSpace ?? 2);
      const width = opts.w ?? m.w;
      node.style.left = `${W - opts.right - width}px`;
    }
  };
  node.recolor = (next) => {
    color = next;
    paint(current);
  };
  return node;
}

export function btn(parent, text, x, y, w, h, bg, onClick) {
  const node = el("button", "kirby-btn");
  node.type = "button";
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
  const canvas = el("canvas", "kirby-btn-label");
  node.appendChild(canvas);

  function paint(value, fill) {
    node.style.background = fill;
    paintPhosCanvas(canvas, value, PHOS_CREAM, { size: 16, letterSpace: 0, align: "center", w: w - 2 });
  }

  let color = bg;
  let caption = text;
  paint(caption, btnFill(color));

  node.addEventListener("pointerdown", () => {
    node.style.background = btnPressed(color);
  });
  node.addEventListener("pointerup", () => {
    node.style.background = btnFill(color);
  });
  node.addEventListener("pointerleave", () => {
    node.style.background = btnFill(color);
  });
  node.addEventListener("click", (e) => {
    e.stopPropagation();
    playUiClick();
    onClick?.();
  });

  node.setAttribute("aria-label", text);
  node.relabel = (value) => {
    caption = value;
    node.setAttribute("aria-label", value);
    paint(caption, btnFill(color));
  };
  node.recolor = (next) => {
    color = next;
    paint(caption, btnFill(color));
  };

  parent.appendChild(node);
  return node;
}

export function worldSky(parent, room) {
  const img = spr("sky.png", -320 * room, -240, 1280, 480);
  img.classList.add("kirby-sky");
  img.dataset.skyKey = `sky-${room}`;
  parent.appendChild(img);
  return img;
}

export function cloud(parent, name, x, y, w, h) {
  const img = spr(name, x, y, w, h);
  parent.appendChild(img);
  return img;
}

export function cloudRoom(parent, room) {
  if (room === 0) {
    cloud(parent, "cloud-small.png", 18, 197, 48, 19);
    cloud(parent, "cloud-small.png", 258, 193, 48, 19);
    cloud(parent, "cloud-hero.png", 84, 184, 152, 45);
  } else if (room === 1) {
    cloud(parent, "cloud-medium.png", 12, 199, 80, 27);
    cloud(parent, "cloud-small.png", 122, 184, 48, 19);
    cloud(parent, "cloud-medium.png", 226, 200, 80, 27);
  } else if (room === 2) {
    cloud(parent, "cloud-small.png", 14, 198, 48, 19);
    cloud(parent, "cloud-medium.png", 104, 190, 80, 27);
    cloud(parent, "cloud-small.png", 258, 201, 48, 19);
  } else {
    cloud(parent, "cloud-small.png", 8, 210, 48, 19);
    cloud(parent, "cloud-medium.png", 120, 203, 80, 27);
    cloud(parent, "cloud-small.png", 264, 210, 48, 19);
  }
}

export function playDeck(parent) {
  cloud(parent, "cloud-small.png", 16, 190, 48, 19);
  cloud(parent, "cloud-medium.png", 76, 184, 80, 27);
  cloud(parent, "cloud-small.png", 168, 188, 48, 19);
  cloud(parent, "cloud-medium.png", 228, 185, 80, 27);
}

export function roomPips(parent, active) {
  const word = ["CLOCK", "WEATHER", "STOPWATCH", "GAME"][active];
  const pip = 6;
  const gap = 6;
  const x0 = 12;
  const y = 229;
  for (let i = 0; i < 4; i++) {
    const p = el("div", i === active ? "kirby-pip kirby-pip-on" : "kirby-pip");
    p.style.left = `${x0 + i * (pip + gap)}px`;
    p.style.top = `${y}px`;
    parent.appendChild(p);
  }
  label(parent, word, { size: 8, color: PHOS_CREAM, x: x0 + 4 * (pip + gap) + 4, y: 227 });
}

export function stageStar(parent, x, y) {
  const img = spr("warp-star.png", x, y, 16, 16);
  parent.appendChild(img);
  if (!prefersReducedMotion()) {
    pingPong({
      key: `star-${x}-${y}`,
      from: y,
      to: y - 3,
      ms: 700,
      ease: easeInOutSine,
      onUpdate: (v) => { img.style.top = `${v}px`; },
    });
  }
  return img;
}

export function spriteBob(node, restY, amp = 3, ms = 700) {
  if (prefersReducedMotion()) return () => {};
  pingPong({
    key: `bob-${restY}-${Math.random().toString(36).slice(2, 7)}`,
    from: restY,
    to: restY - amp,
    ms,
    ease: easeInOutSine,
    onUpdate: (v) => { node.style.top = `${v}px`; },
  });
  return () => {};
}

export function pulseLabel(node) {
  const key = node.dataset.pulseKey || `pulse-${Math.random().toString(36).slice(2, 8)}`;
  node.dataset.pulseKey = key;
  if (prefersReducedMotion()) {
    node.style.opacity = "1";
    return;
  }
  pingPong({
    key,
    from: 70 / 255,
    to: 1,
    ms: 520,
    onUpdate: (v) => { node.style.opacity = String(v); },
  });
}

export function stopPulse(node) {
  if (node.dataset.pulseKey) cancelAnim(node.dataset.pulseKey);
  node.style.opacity = "1";
}

export function page(parent, key) {
  const node = el("div", "kirby-page");
  node.dataset.pageKey = key;
  parent.appendChild(node);
  return node;
}

export function screen() {
  return el("div", "kirby-screen");
}

export function goldSep(parent, y) {
  const node = el("div", "kirby-sep");
  node.style.top = `${y}px`;
  parent.appendChild(node);
  return node;
}

export { PHOS_INK };
