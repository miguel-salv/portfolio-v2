import { createCanvas, createLoop } from "../platform.js";
import { createState, MOTOR_MIN_POS, MOTOR_MAX_POS } from "../impedance-matcher/state.js";
import { matchingTick, vswrSurface, SWEET_M1_DEG, SWEET_M2_DEG } from "../impedance-matcher/matcher.js";

// Logical canvas size, matches the inline VSWR tuner (js/instrument.js)
const SIZE = 240;
const CELLS = 60;
const RESET_HOLD_MS = 1400;
const MAX_TRAIL = 260;

// Worst-case VSWR across the travel envelope, anchors the field colour ramp
const V_MAX = Math.max(
  vswrSurface(MOTOR_MIN_POS, MOTOR_MIN_POS),
  vswrSurface(MOTOR_MIN_POS, MOTOR_MAX_POS),
  vswrSurface(MOTOR_MAX_POS, MOTOR_MIN_POS),
  vswrSurface(MOTOR_MAX_POS, MOTOR_MAX_POS)
);

function hexToRgb(hex) {
  const h = hex.trim().replace("#", "");
  const n = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const rgb = (c, alpha) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha ?? 1})`;

// Reads direct-hex tokens so both surfaces share one palette; re-read on theme change
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const tok = (name, fallback) => {
    const raw = cs.getPropertyValue(name).trim();
    return hexToRgb(raw && raw.startsWith("#") ? raw : fallback);
  };
  const stone = tok("--stone", "#bda383");
  const bone = tok("--bone", "#fff8e9");
  return {
    good: tok("--brand-light", "#4d7291"),
    bad: mix(stone, bone, 0.42),
    accent: tok("--brand", "#3d5a73"),
    ink: tok("--ink", "#241914"),
    bone,
  };
}

function buildField(pal) {
  const off = document.createElement("canvas");
  off.width = SIZE;
  off.height = SIZE;
  const octx = off.getContext("2d");
  const cell = SIZE / CELLS;
  for (let i = 0; i < CELLS; i++) {
    const m1 = ((i + 0.5) / CELLS) * MOTOR_MAX_POS;
    for (let j = 0; j < CELLS; j++) {
      const m2 = (1 - (j + 0.5) / CELLS) * MOTOR_MAX_POS;
      const v = vswrSurface(m1, m2);
      const t = Math.min(1, Math.max(0, (v - 1) / (V_MAX - 1)));
      octx.fillStyle = rgb(mix(pal.good, pal.bad, Math.pow(t, 0.85)));
      octx.fillRect(i * cell, j * cell, cell + 1, cell + 1);
    }
  }
  return off;
}

const xOf = (m1) => (m1 / MOTOR_MAX_POS) * SIZE;
const yOf = (m2) => (1 - m2 / MOTOR_MAX_POS) * SIZE;

export function mount(frame) {
  const { canvas, ctx } = createCanvas(frame, SIZE, SIZE, { dprCap: 2 });
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = "1 / 1";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Automated impedance matcher converging across the VSWR field");

  const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = reducedMotionMQ.matches;

  let pal = palette();
  let field = buildField(pal);
  const themeObserver = new MutationObserver(() => {
    pal = palette();
    field = buildField(pal);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  let state = createState();
  let trail = [];
  let holdT = 0;
  let converged = false;
  let matchGlow = 0; // 0 = ink dot, 1 = matched (blue); eased for a smooth fade.

  function randomizeStart() {
    const m1 = 6 + Math.random() * 168;
    const m2 = 6 + Math.random() * 168;
    state = createState();
    state.motor1_pos = (m1 * Math.PI) / 180;
    state.motor2_pos = (m2 * Math.PI) / 180;
    state.atMatch = false;
    trail = [{ m1, m2 }];
    holdT = 0;
    converged = false;
    matchGlow = 0;
  }
  randomizeStart();

  function step() {
    if (converged) {
      holdT += 1000 / 50;
      if (holdT >= RESET_HOLD_MS) randomizeStart();
      return;
    }
    matchingTick(state);
    const m1 = (state.motor1_pos * 180) / Math.PI;
    const m2 = (state.motor2_pos * 180) / Math.PI;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(m1 - last.m1, m2 - last.m2) > 0.15) {
      trail.push({ m1, m2 });
      if (trail.length > MAX_TRAIL) trail.shift();
    }
    if (state.atMatch) converged = true;
  }

  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(field, 0, 0, SIZE, SIZE);

    // Descent path traced during convergence
    if (trail.length > 1) {
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = rgb(pal.ink, 0.5);
      ctx.beginPath();
      ctx.moveTo(xOf(trail[0].m1), yOf(trail[0].m2));
      for (let i = 1; i < trail.length; i++) ctx.lineTo(xOf(trail[i].m1), yOf(trail[i].m2));
      ctx.stroke();
    }

    // Target (matched load): ringed crosshair
    const tx = xOf(SWEET_M1_DEG);
    const ty = yOf(SWEET_M2_DEG);
    ctx.strokeStyle = rgb(pal.accent, 0.9);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 11, ty);
    ctx.lineTo(tx - 3, ty);
    ctx.moveTo(tx + 3, ty);
    ctx.lineTo(tx + 11, ty);
    ctx.moveTo(tx, ty - 11);
    ctx.lineTo(tx, ty - 3);
    ctx.moveTo(tx, ty + 3);
    ctx.lineTo(tx, ty + 11);
    ctx.stroke();

    // Current position: filled probe with a halo for contrast on any tone
    const cur = trail[trail.length - 1];
    if (cur) {
      const cx = xOf(cur.m1);
      const cy = yOf(cur.m2);
      const matched = vswrSurface(cur.m1, cur.m2) < 1.05;
      matchGlow += ((matched ? 1 : 0) - matchGlow) * (reducedMotion ? 1 : 0.12);
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgb(mix(pal.ink, pal.good, matchGlow));
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgb(pal.bone, 0.95);
      ctx.stroke();
    }
  }

  if (reducedMotion) {
    for (let i = 0; i < 4000 && !converged; i++) step();
    draw();
  }

  const loop = createLoop(
    () => {
      step();
      draw();
    },
    { fixedStep: 1000 / 50 }
  );

  draw();
  if (!reducedMotion) loop.start();

  reducedMotionMQ.addEventListener?.("change", (e) => {
    reducedMotion = e.matches;
    if (reducedMotion) {
      loop.stop();
      for (let i = 0; i < 4000 && !converged; i++) step();
      draw();
    } else if (document.contains(frame)) {
      loop.start();
    }
  });

  return {
    pause() {
      loop.stop();
    },
    resume() {
      if (!reducedMotion) loop.start();
    },
  };
}
