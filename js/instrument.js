import {
  createState,
  MODE_AUTO,
  MODE_MANUAL,
  MOTOR_MIN_POS,
  MOTOR_MAX_POS,
} from "./demos/impedance-matcher/state.js";
import {
  matchingTick,
  setMotorStep,
  vswrSurface,
  SWEET_M1_DEG,
  SWEET_M2_DEG,
} from "./demos/impedance-matcher/matcher.js";
import { createLoop } from "./demos/platform.js";
import { createField3D } from "./demos/impedance-matcher/field3d.js";

const root = document.querySelector("[data-instrument]");
const toggle = document.querySelector("[data-instrument-toggle]");
if (root && toggle) {
  wireDisclosure(root, toggle);
} else if (root) {
  // No disclosure trigger: mount immediately
  init(root);
}

// Collapse the tuner behind a disclosure; init runs lazily on first expand
// and returns a controller so re-collapsing can halt the auto-tune loop
function wireDisclosure(root, toggle) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const label = toggle.querySelector(".instrument-toggle-text");
  const heading = root.querySelector("#instrument-title");
  if (heading) heading.setAttribute("tabindex", "-1");

  let controller = null;
  let expanded = false;

  toggle.hidden = false;

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));

    if (expanded) {
      root.hidden = false;
      if (!controller) controller = init(root);
      if (label) label.textContent = "Hide Tuner";
      if (!reduceMotion) {
        root.classList.add("is-entering");
        root.addEventListener(
          "animationend",
          () => root.classList.remove("is-entering"),
          { once: true }
        );
      }
      if (heading) heading.focus({ preventScroll: true });
    } else {
      controller?.pause();
      root.hidden = true;
      if (label) label.textContent = "Try It Yourself";
      toggle.focus({ preventScroll: true });
    }
  });
}

function init(root) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fieldWrap = root.querySelector("[data-field]");
  const c1Input = root.querySelector("[data-c1]");
  const c2Input = root.querySelector("[data-c2]");
  const c1Read = root.querySelector("[data-c1-read]");
  const c2Read = root.querySelector("[data-c2-read]");
  const autoBtn = root.querySelector("[data-autotune]");
  const detuneBtn = root.querySelector("[data-detune]");
  const vswrEl = root.querySelector("[data-vswr]");
  const rlEl = root.querySelector("[data-return-loss]");
  const refEl = root.querySelector("[data-ref]");
  const refBar = root.querySelector("[data-ref-bar]");
  const statusEl = root.querySelector("[data-status]");
  const liveEl = root.querySelector("[data-live]");
  if (!fieldWrap || !c1Input || !c2Input || !autoBtn) return;

  const state = createState();
  state.radioTX = true;

  // Worst-case VSWR across the travel envelope; anchors the colour ramp
  const V_MAX = Math.max(
    vswrSurface(MOTOR_MIN_POS, MOTOR_MIN_POS),
    vswrSurface(MOTOR_MIN_POS, MOTOR_MAX_POS),
    vswrSurface(MOTOR_MAX_POS, MOTOR_MIN_POS),
    vswrSurface(MOTOR_MAX_POS, MOTOR_MAX_POS)
  );

  const LOGICAL = 240; // 2D field logical size (DPR-scaled backing store)
  const trail = []; // Recent {m1, m2} degrees during auto-tune

  const clampDeg = (v) => Math.max(MOTOR_MIN_POS, Math.min(MOTOR_MAX_POS, v));
  // Continuous (unrounded) motor angle in degrees
  const m1deg = () => (state.motor1_pos * 180) / Math.PI;
  const m2deg = () => (state.motor2_pos * 180) / Math.PI;

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

  // Reads direct-hex tokens only; re-read on theme change
  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const tok = (name, fallback) => {
      const raw = cs.getPropertyValue(name).trim();
      return hexToRgb(raw && raw.startsWith("#") ? raw : fallback);
    };
    const good = tok("--brand-light", "#4d7291");
    const stone = tok("--stone", "#bda383");
    const bone = tok("--bone", "#fff8e9");
    return {
      good,
      bad: mix(stone, bone, 0.42),
      accent: tok("--brand", "#3d5a73"),
      ink: tok("--ink", "#241914"),
      bone,
    };
  }

  // ---------------------------------------------------------------------------
  // Renderers. A 2D heatmap ships by default; when WebGL is available we lazily
  // upgrade to a 3D relief of the same surface. Both expose the same interface
  // ({el, render, refreshPalette, pointerToDeg, resize, dispose}), and render()
  // takes a scene snapshot {m1, m2, trail, matchGlow} in degrees.
  // ---------------------------------------------------------------------------
  function create2DRenderer(mount) {
    const canvas = document.createElement("canvas");
    canvas.className = "instrument-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LOGICAL * dpr;
    canvas.height = LOGICAL * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    canvas.style.touchAction = "none";
    mount.appendChild(canvas);

    let pal = palette();
    let field = null; // Cached VSWR bitmap (rebuilt on theme change)
    const xOf = (m1) => (m1 / MOTOR_MAX_POS) * LOGICAL;
    const yOf = (m2) => (1 - m2 / MOTOR_MAX_POS) * LOGICAL;

    function buildField() {
      pal = palette();
      const off = document.createElement("canvas");
      off.width = LOGICAL;
      off.height = LOGICAL;
      const octx = off.getContext("2d");
      const CELLS = 60;
      const cell = LOGICAL / CELLS;
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
      field = off;
    }

    function render({ m1, m2, trail, matchGlow }) {
      if (!field) buildField();
      ctx.clearRect(0, 0, LOGICAL, LOGICAL);
      ctx.drawImage(field, 0, 0, LOGICAL, LOGICAL);

      if (trail.length > 1) {
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        ctx.strokeStyle = rgb(pal.ink, 0.5);
        ctx.beginPath();
        ctx.moveTo(xOf(trail[0].m1), yOf(trail[0].m2));
        for (let i = 1; i < trail.length; i++) ctx.lineTo(xOf(trail[i].m1), yOf(trail[i].m2));
        ctx.stroke();
      }

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

      const cx = xOf(m1);
      const cy = yOf(m2);
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgb(mix(pal.ink, pal.good, matchGlow));
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgb(pal.bone, 0.95);
      ctx.stroke();
    }

    return {
      el: canvas,
      render,
      refreshPalette() {
        field = null;
      },
      pointerToDeg(event) {
        const r = canvas.getBoundingClientRect();
        const px = (event.clientX - r.left) / r.width;
        const py = (event.clientY - r.top) / r.height;
        return [
          clampDeg(Math.round(px * MOTOR_MAX_POS)),
          clampDeg(Math.round((1 - py) * MOTOR_MAX_POS)),
        ];
      },
      resize() {},
      dispose() {
        canvas.remove();
      },
    };
  }

  let renderer = create2DRenderer(fieldWrap);

  let matchGlow = 0; // Dot colour: 0 = ink, 1 = matched blue
  let glowRaf = 0;

  function stepGlow() {
    const target = currentVSWR() < 1.05 ? 1 : 0;
    if (reduceMotion) {
      matchGlow = target;
      return;
    }
    matchGlow += (target - matchGlow) * 0.12;
    if (Math.abs(target - matchGlow) < 0.004) matchGlow = target;
  }

  // Keep ticking the glow fade on rAF when nothing else drives frames
  function ensureGlowSettles() {
    if (reduceMotion || glowRaf || loop.running) return;
    const target = currentVSWR() < 1.05 ? 1 : 0;
    if (matchGlow === target) return;
    glowRaf = requestAnimationFrame(() => {
      glowRaf = 0;
      draw();
      ensureGlowSettles();
    });
  }

  const buildScene = () => ({ m1: m1deg(), m2: m2deg(), trail, matchGlow });

  function draw() {
    stepGlow();
    renderer.render(buildScene());
  }

  // WebGL capability probe; skips the 3D upgrade on unsupported contexts
  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (_) {
      return false;
    }
  }

  // Swap the 2D field for the 3D relief once three.js loads. Runs after boot;
  // any failure (no WebGL, blocked CDN, context loss) keeps the 2D renderer.
  async function tryUpgrade3D() {
    if (!hasWebGL()) return;
    let THREE;
    try {
      THREE = await import("three");
    } catch (_) {
      return;
    }
    let next;
    try {
      next = createField3D(THREE, {
        mount: fieldWrap,
        vswrSurface,
        vMax: V_MAX,
        motorMax: MOTOR_MAX_POS,
        sweetM1: SWEET_M1_DEG,
        sweetM2: SWEET_M2_DEG,
        palette,
      });
    } catch (_) {
      return;
    }
    const prev = renderer;
    renderer = next;
    bindPointer(renderer.el);
    prev.dispose();
    draw();
  }

  const currentVSWR = () => vswrSurface(m1deg(), m2deg());
  const fmtVSWR = (v) => v.toFixed(2);
  function setStatus(v) {
    let label = "Reflecting";
    let mod = "is-off";
    if (v < 1.05) {
      label = "Matched";
      mod = "is-matched";
    } else if (v < 1.5) {
      label = "Near match";
      mod = "is-near";
    }
    statusEl.textContent = label;
    statusEl.className = `instrument-status ${mod}`;
  }

  // ~1.2 VSWR at ~95 W forward: forward power is fixed, reflected derives from
  // the live reflection coefficient
  const P_FWD = 95; // W

  function updateReadout() {
    const v = currentVSWR();
    const gamma = (v - 1) / (v + 1);
    const reflFrac = gamma * gamma; // Fraction of forward power reflected
    const refW = reflFrac * P_FWD; // Reflected power, watts
    const returnLoss = gamma < 1e-4 ? Infinity : -20 * Math.log10(gamma);
    const m1 = Math.round(m1deg());
    const m2 = Math.round(m2deg());

    if (vswrEl) vswrEl.textContent = fmtVSWR(v);
    if (rlEl) rlEl.textContent = returnLoss >= 40 ? "> 40 dB" : `${returnLoss.toFixed(1)} dB`;
    if (refEl) refEl.textContent = refW < 10 ? `${refW.toFixed(1)}\u00A0W` : `${Math.round(refW)}\u00A0W`;
    if (refBar) refBar.style.width = `${Math.min(100, reflFrac * 100)}%`;
    if (c1Read) c1Read.textContent = `${m1}\u00B0`;
    if (c2Read) c2Read.textContent = `${m2}\u00B0`;
    setStatus(v);

    const vt = `${v.toFixed(2)} to 1`;
    c1Input.setAttribute("aria-valuetext", `${m1} degrees, VSWR ${vt}`);
    c2Input.setAttribute("aria-valuetext", `${m2} degrees, VSWR ${vt}`);
  }

  const announce = (msg) => {
    if (liveEl) liveEl.textContent = msg;
  };

  const refresh = () => {
    updateReadout();
    draw();
    ensureGlowSettles();
  };

  function syncInputs() {
    c1Input.value = String(state.motor1Pos);
    c2Input.value = String(state.motor2Pos);
  }

  function setPositions(c1, c2) {
    setMotorStep(state, 1, clampDeg(c1));
    setMotorStep(state, 2, clampDeg(c2));
  }

  function onSlider() {
    stopAuto(false);
    trail.length = 0;
    setPositions(Number(c1Input.value), Number(c2Input.value));
    refresh();
  }
  c1Input.addEventListener("input", onSlider);
  c2Input.addEventListener("input", onSlider);
  c1Input.addEventListener("change", () => announce(`Capacitor 1 ${state.motor1Pos} degrees. VSWR ${currentVSWR().toFixed(2)} to 1.`));
  c2Input.addEventListener("change", () => announce(`Capacitor 2 ${state.motor2Pos} degrees. VSWR ${currentVSWR().toFixed(2)} to 1.`));

  // Draggable field (pointer enhancement; sliders remain the a11y path).
  // pointerToDeg lives on the active renderer and rebinds on 3D upgrade.
  let dragging = false;
  function onPointerDown(event) {
    const deg = renderer.pointerToDeg(event);
    if (!deg) return;
    dragging = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (_) { /* Capture optional */ }
    stopAuto(false);
    trail.length = 0;
    setPositions(deg[0], deg[1]);
    syncInputs();
    refresh();
  }
  function onPointerMove(event) {
    if (!dragging) return;
    const deg = renderer.pointerToDeg(event);
    if (!deg) return;
    setPositions(deg[0], deg[1]);
    syncInputs();
    refresh();
  }
  function onPointerEnd(event) {
    if (!dragging) return;
    dragging = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_) { /* Ignore */ }
    announce(`VSWR ${currentVSWR().toFixed(2)} to 1.`);
  }
  function bindPointer(el) {
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerEnd);
    el.addEventListener("pointercancel", onPointerEnd);
  }
  bindPointer(renderer.el);

  // Auto-tune: same matchingTick firmware on a fixed 50 Hz step; stops when the
  // firmware flags a match (state.atMatch)
  const MAX_TRAIL = 260;
  const SAFETY_TICKS = 4000; // Reduced-motion fast-forward ceiling
  let converged = false;
  let pausedRunning = false; // Was mid-tune when scrolled off-screen

  function setAutoUI(on) {
    autoBtn.setAttribute("aria-pressed", String(on));
    autoBtn.textContent = on ? "Tuning\u2026" : "Auto-tune";
    autoBtn.classList.toggle("is-tuning", on);
  }

  // One sim step; append to the path only once it has moved a perceptible bit
  function autoStep() {
    matchingTick(state);
    const m1 = m1deg();
    const m2 = m2deg();
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(m1 - last.m1, m2 - last.m2) > 0.15) {
      trail.push({ m1, m2 });
      if (trail.length > MAX_TRAIL) trail.shift();
    }
    if (state.atMatch) converged = true;
  }

  function seedTrail() {
    trail.length = 0;
    trail.push({ m1: m1deg(), m2: m2deg() });
  }

  const loop = createLoop(
    () => {
      if (converged) return;
      autoStep();
      syncInputs();
      refresh();
      if (converged) stopAuto(true);
    },
    { fixedStep: 1000 / 50 }
  );

  function startAuto() {
    if (loop.running) {
      stopAuto(false);
      return;
    }
    if (currentVSWR() < 1.03) {
      announce("Already matched.");
      return;
    }
    // Hand control to the descent firmware, seeded at the current position
    state.opMode = MODE_AUTO;
    state.atMatch = false;
    state.dM1 = 0.1;
    state.dM2 = 0.1;
    converged = false;
    seedTrail();

    if (reduceMotion) {
      // Run the descent to completion, then show it statically
      for (let i = 0; i < SAFETY_TICKS && !converged; i++) autoStep();
      state.opMode = MODE_MANUAL;
      syncInputs();
      refresh();
      announce(`Matched. VSWR ${currentVSWR().toFixed(2)} to 1.`);
      return;
    }

    setAutoUI(true);
    announce("Auto-tuning\u2026");
    loop.start();
  }

  function stopAuto(done) {
    loop.stop();
    pausedRunning = false;
    state.opMode = MODE_MANUAL;
    setAutoUI(false);
    ensureGlowSettles();
    if (done) announce(`Matched. VSWR ${currentVSWR().toFixed(2)} to 1.`);
  }

  autoBtn.addEventListener("click", startAuto);

  detuneBtn?.addEventListener("click", () => {
    stopAuto(false);
    trail.length = 0;
    const rnd = (lo, hi) => Math.round(lo + Math.random() * (hi - lo));
    let m1;
    let m2;
    do {
      m1 = rnd(0, MOTOR_MAX_POS);
      m2 = rnd(0, MOTOR_MAX_POS);
    } while (Math.abs(m1 - SWEET_M1_DEG) < 35 && Math.abs(m2 - SWEET_M2_DEG) < 35);
    setPositions(m1, m2);
    syncInputs();
    refresh();
    announce(`Detuned. VSWR ${currentVSWR().toFixed(2)} to 1.`);
  });

  // Re-render field on theme switch
  new MutationObserver(() => {
    renderer.refreshPalette();
    draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // Pause the tune loop when scrolled off-screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (pausedRunning && !loop.running) {
              pausedRunning = false;
              loop.start();
            }
          } else if (loop.running) {
            pausedRunning = true;
            loop.stop();
          }
        }
      },
      { rootMargin: "120px 0px" }
    ).observe(root);
  }

  setPositions(Number(c1Input.value), Number(c2Input.value));
  refresh();
  tryUpgrade3D();

  // Controller for the disclosure wrapper: halt the tune loop on collapse
  return {
    pause() {
      stopAuto(false);
    },
  };
}
