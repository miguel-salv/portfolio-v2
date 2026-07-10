import { createCanvas, createLoop } from "../platform.js";
import { createScheduler } from "./scheduler.js";
import { createTimeline } from "./timeline.js";
import { createControls } from "./controls.js";

// Periods and compute budgets mirror the firmware's PID/UART/LCD timing
const DEFAULT_TASKS = [
  { id: "pid", name: "PID", c: 60, t: 100 },
  { id: "uart", name: "UART", c: 10, t: 200 },
  { id: "lcd", name: "LCD", c: 100, t: 1600 },
];

const SIM_SPEED = 0.16;
const WINDOW_MS = 1600;
const CANVAS_W = 620;
const CANVAS_H = 200;

function readTheme() {
  const style = getComputedStyle(document.documentElement);
  const v = (name, fallback) => {
    const val = style.getPropertyValue(name);
    return val && val.trim() ? val.trim() : fallback;
  };
  return {
    ink: v("--ink", "#241914"),
    inkMute: v("--ink-mute", "#765d49"),
    inkFaint: v("--ink-faint", "#7d654c"),
    rule: v("--rule-light", "#dac6a9"),
    laneBgA: v("--surface", "#fff8e9"),
    laneBgB: v("--bg", "#f4ead8"),
    monoFont: "IBM Plex Mono, ui-monospace, monospace",
    pid: v("--rtos-pid", v("--brand-light", "#4d7291")),
    uart: v("--rtos-uart", v("--olive", "#8b7a4b")),
    lcd: v("--rtos-lcd", v("--stone", "#bda383")),
    idle: v("--rtos-idle", v("--rule-light", "#dac6a9")),
    pendsv: v("--rtos-pendsv", v("--ink-mute", "#765d49")),
    miss: v("--rtos-miss", "#b3392c"),
  };
}

export function mount(frame) {
  const wrap = document.createElement("div");
  wrap.className = "rtos-demo";
  frame.appendChild(wrap);

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "rtos-canvas-wrap";
  wrap.appendChild(canvasWrap);

  const { canvas, ctx } = createCanvas(canvasWrap, CANVAS_W, CANVAS_H, { dprCap: 2 });
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${CANVAS_W} / ${CANVAS_H}`;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Scrolling rate-monotonic scheduling timeline for the PID, UART, and LCD tasks");

  const timeline = createTimeline(ctx, CANVAS_W, CANVAS_H, { windowMs: WINDOW_MS });
  const scheduler = createScheduler(DEFAULT_TASKS);

  let colors = readTheme();
  let snapshot = scheduler.getSnapshot();

  const themeObserver = new MutationObserver(() => {
    colors = readTheme();
    renderAt(snapshot.clockMs);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // nowMs may lead snapshot.clockMs between ticks so the timeline scrolls at
  // the display's refresh rate, not the slower sim rate
  function renderAt(nowMs) {
    timeline.draw(snapshot, colors, nowMs);
    controls.updateStats(snapshot);
  }

  const controls = createControls(DEFAULT_TASKS, {
    onChange(taskId, key, value) {
      scheduler.setTaskParam(taskId, key, value);
      snapshot = scheduler.getSnapshot();
      renderAt(snapshot.clockMs);
    },
  });
  wrap.appendChild(controls.el);

  const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  const loop = createLoop(
    (dtMs) => {
      scheduler.advance(dtMs * SIM_SPEED);
      snapshot = scheduler.getSnapshot();
    },
    {
      fixedStep: 1000 / 45,
      // Extrapolate by leftover accumulator time so a 45Hz sim step
      // doesn't judder on a 60/120/144Hz display
      render(leftoverMs) {
        renderAt(snapshot.clockMs + leftoverMs * SIM_SPEED);
      },
    }
  );

  if (reducedMotionMQ.matches) {
    scheduler.advance(2200);
    snapshot = scheduler.getSnapshot();
    renderAt(snapshot.clockMs);
  } else {
    loop.start();
  }

  reducedMotionMQ.addEventListener?.("change", (e) => {
    if (e.matches) {
      loop.stop();
      renderAt(snapshot.clockMs);
    } else if (document.contains(frame)) {
      loop.start();
    }
  });

  return {
    pause() {
      loop.stop();
    },
    resume() {
      if (!reducedMotionMQ.matches) loop.start();
    },
  };
}
