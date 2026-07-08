import { createCanvas, createLoop } from "../platform.js";
import { createState } from "../impedance-matcher/state.js";
import { matchingTick, vswrSurface, SWEET_M1_DEG, SWEET_M2_DEG } from "../impedance-matcher/matcher.js";

const SIZE = 260;
const RESET_HOLD_MS = 1400;
const MAX_TRAIL = 260;

function readTheme() {
  const style = getComputedStyle(document.documentElement);
  const v = (name, fallback) => {
    const val = style.getPropertyValue(name);
    return val && val.trim() ? val.trim() : fallback;
  };
  return {
    good: v("--heatmap-good", "#4f8a5b"),
    bad: v("--heatmap-bad", "#b3392c"),
    path: v("--heatmap-path", v("--ink", "#241914")),
    target: v("--heatmap-target", v("--brand", "#3d5a73")),
  };
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildHeatmapBitmap(size, colors) {
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const octx = off.getContext("2d");
  const img = octx.createImageData(size, size);
  const good = hexToRgb(colors.good);
  const bad = hexToRgb(colors.bad);

  let maxVswr = 1;
  const surfaceCache = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const m1 = (px / size) * 180;
      const m2 = (1 - py / size) * 180;
      const vswr = vswrSurface(m1, m2);
      surfaceCache[py * size + px] = vswr;
      if (vswr > maxVswr) maxVswr = vswr;
    }
  }

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const vswr = surfaceCache[py * size + px];
      const t = Math.min(1, (vswr - 1) / (maxVswr - 1 || 1));
      const idx = (py * size + px) * 4;
      img.data[idx] = lerp(good[0], bad[0], t);
      img.data[idx + 1] = lerp(good[1], bad[1], t);
      img.data[idx + 2] = lerp(good[2], bad[2], t);
      img.data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}

function toCanvasPoint(m1Deg, m2Deg) {
  return {
    x: (m1Deg / 180) * SIZE,
    y: (1 - m2Deg / 180) * SIZE,
  };
}

export function mount(frame) {
  const { canvas, ctx } = createCanvas(frame, SIZE, SIZE, { dprCap: 2 });
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = "1 / 1";
  canvas.setAttribute("role", "img");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let colors = readTheme();
  let bitmap = buildHeatmapBitmap(SIZE, colors);
  const themeObserver = new MutationObserver(() => {
    colors = readTheme();
    bitmap = buildHeatmapBitmap(SIZE, colors);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  let state = createState();
  let trail = [];
  let holdT = 0;
  let converged = false;

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
    ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);

    const target = toCanvasPoint(SWEET_M1_DEG, SWEET_M2_DEG);
    ctx.beginPath();
    ctx.arc(target.x, target.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = colors.target;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (trail.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = colors.path;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.85;
      trail.forEach((p, i) => {
        const pt = toCanvasPoint(p.m1, p.m2);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const cur = trail[trail.length - 1];
    if (cur) {
      const pt = toCanvasPoint(cur.m1, cur.m2);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = colors.path;
      ctx.fill();
    }
  }

  if (reducedMotion) {
    for (let i = 0; i < 4000 && !converged; i++) step();
    draw();
    return { pause() {}, resume() {} };
  }

  const loop = createLoop(
    () => {
      step();
      draw();
    },
    { fixedStep: 1000 / 50 }
  );

  draw();
  loop.start();

  return {
    pause() {
      loop.stop();
    },
    resume() {
      loop.start();
    },
  };
}
