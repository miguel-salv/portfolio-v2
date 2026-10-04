import { el, spr } from "./components/ui.js";
import { playUiChange } from "./audio.js";
import { DIGIT_W, PHOS_GOLD, PHOS_INK, asset } from "./theme.js";

export function createStepper(parent, x, y, state, name = "value") {
  const gap = 8;
  const bw = DIGIT_W * 2 + gap;
  const bh = 24;
  const pad = 16;
  const box = el("div", "kirby-stepper");
  box.setAttribute("role", "group");
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.style.width = `${bw}px`;
  box.style.height = `${bh + pad + 64 + pad + bh}px`;

  const d0 = spr("digit-0.png", 0, bh + pad, DIGIT_W, 64);
  const d1 = spr("digit-0.png", DIGIT_W + gap, bh + pad, DIGIT_W, 64);
  box.append(d0, d1);

  function refresh() {
    const v = state.value;
    box.setAttribute("aria-label", `${name}: ${v}`);
    d0.src = asset(`digit-${Math.floor(v / 10) % 10}.png`);
    d1.src = asset(`digit-${v % 10}.png`);
  }

  function delta(d) {
    const span = state.max - state.min + 1;
    let v = state.value + d;
    while (v > state.max) v -= span;
    while (v < state.min) v += span;
    state.value = v;
    refresh();
    playUiChange();
    state.onChange?.();
  }

  function chevron(up, cy) {
    const b = el("button", "kirby-stepper-btn");
    b.type = "button";
    b.style.left = "0px";
    b.style.top = `${cy - 10}px`;
    b.style.width = `${bw}px`;
    b.style.height = `${bh + 20}px`;
    b.style.setProperty("--stepper-fill", PHOS_INK);
    b.setAttribute("aria-label", `${up ? "Increase" : "Decrease"} ${name.toLowerCase()}`);
    const icon = spr(up ? "chev-up.png" : "chev-dn.png", Math.floor((bw - 16) / 2), Math.floor((bh + 20 - 8) / 2), 16, 8);
    icon.style.position = "absolute";
    b.appendChild(icon);

    let hold = 0;
    let repeat = 0;
    const step = () => delta(up ? 1 : -1);
    const clear = () => {
      clearTimeout(hold);
      clearInterval(repeat);
      b.style.setProperty("--stepper-fill", PHOS_INK);
    };
    b.releaseHold = clear;
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.isPrimary === false) return;
      e.stopPropagation();
      clear();
      b.setPointerCapture(e.pointerId);
      b.style.setProperty("--stepper-fill", PHOS_GOLD);
      step();
      hold = window.setTimeout(() => {
        repeat = window.setInterval(step, 80);
      }, 400);
    });
    b.addEventListener("pointerup", clear);
    b.addEventListener("pointercancel", clear);
    b.addEventListener("lostpointercapture", clear);
    b.addEventListener("blur", clear);
    b.addEventListener("pointerleave", clear);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.detail === 0) step();
    });
    box.appendChild(b);
    return b;
  }

  chevron(true, 0);
  chevron(false, bh + pad + 64 + pad);
  parent.appendChild(box);
  refresh();
  return { box, refresh, get value() { return state.value; }, set value(v) { state.value = v; refresh(); } };
}

export function cancelStepperHolds(root) {
  root.querySelectorAll('.kirby-stepper-btn').forEach(button => button.releaseHold?.());
}
