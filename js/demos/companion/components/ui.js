import { W, H } from "../theme.js";
import { playUiClick } from "../audio.js";

export function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function label(parent, text, opts = {}) {
  const node = el("div", "kirby-label");
  node.textContent = text;
  node.style.font = opts.font || "600 16px Montserrat, sans-serif";
  node.style.color = opts.color || "#fff";
  if (opts.x != null) node.style.left = `${opts.x}px`;
  if (opts.y != null) node.style.top = `${opts.y}px`;
  if (opts.bottom != null) node.style.bottom = `${opts.bottom}px`;
  if (opts.center) {
    node.style.left = "50%";
    node.style.transform = "translateX(-50%)";
    if (opts.y != null) node.style.top = `${opts.y}px`;
    if (opts.bottom != null) {
      node.style.top = "auto";
      node.style.bottom = `${opts.bottom}px`;
    }
  }
  if (opts.w) {
    node.style.width = `${opts.w}px`;
    node.style.textAlign = opts.align || "left";
  }
  parent.appendChild(node);
  return node;
}

// Label centered on the 240px screen with a Y offset from middle
export function centerLabel(parent, text, offsetY, opts = {}) {
  const node = el("div", "kirby-label kirby-label--mid");
  node.textContent = text;
  node.style.font = opts.font || "600 16px Montserrat, sans-serif";
  node.style.color = opts.color || "#fff";
  node.style.left = "50%";
  node.style.top = `calc(50% + ${offsetY}px)`;
  node.style.transform = "translate(-50%, -50%)";
  if (opts.w) {
    node.style.width = `${opts.w}px`;
    node.style.textAlign = opts.align || "center";
  }
  parent.appendChild(node);
  return node;
}

export function btn(parent, text, x, y, w, h, bg, onClick) {
  const node = el("button", "kirby-btn");
  node.type = "button";
  node.textContent = text;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
  node.style.background = `linear-gradient(180deg, ${bg}, color-mix(in srgb, ${bg} 50%, black))`;
  node.addEventListener("click", (e) => {
    e.stopPropagation();
    playUiClick();
    onClick?.();
  });
  parent.appendChild(node);
  return node;
}

export function stars(parent) {
  const sl = label(parent, "*", { font: "600 16px Montserrat", color: "rgb(255, 230, 140)", x: 6, y: 4 });
  const sr = el("div", "kirby-label");
  sr.textContent = "*";
  sr.style.font = "600 16px Montserrat";
  sr.style.color = "rgb(255, 230, 140)";
  sr.style.right = "6px";
  sr.style.top = "4px";
  parent.appendChild(sr);
  return [sl, sr];
}

export function horizGradBg(parent, reverse = false) {
  parent.style.background = reverse
    ? "linear-gradient(90deg, rgb(40, 65, 150), rgb(130, 60, 115))"
    : "linear-gradient(90deg, rgb(130, 60, 115), rgb(40, 65, 150))";
}
