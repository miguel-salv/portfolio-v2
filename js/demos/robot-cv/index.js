import { createCanvas, createLoop } from "../platform.js";
import { createScene } from "./scene.js";
import { createUartLog, CMD } from "./uart.js";

const CANVAS_W = 480;
const CANVAS_H = 300;

function readTheme() {
  const style = getComputedStyle(document.documentElement);
  const v = (name, fallback) => {
    const val = style.getPropertyValue(name);
    return val && val.trim() ? val.trim() : fallback;
  };
  return {
    rule: v("--rule-light", "#dac6a9"),
    monoFont: "IBM Plex Mono, ui-monospace, monospace",
    robot: v("--robot-body", v("--brand", "#3d5a73")),
    robotAccent: v("--robot-accent", v("--brand-light", "#4d7291")),
    robotDark: v("--robot-dark", "#2c4358"),
    robotLens: v("--robot-lens", "#1a2f40"),
    bottle: v("--robot-bottle", "#4f8a5b"),
    bottleCap: v("--robot-bottle-cap", "#345e3d"),
    bottleOutline: v("--robot-bottle-outline", "#3a6b44"),
    bottleHighlight: v("--robot-bottle-highlight", "rgba(255,255,255,0.35)"),
    bottleLabel: v("--robot-bottle-label", "#2c5435"),
    detect: v("--robot-detect", v("--rtos-miss", "#b3392c")),
    scan: v("--robot-scan", v("--ink-faint", "#7d654c")),
  };
}

function buildLogPanel() {
  const wrap = document.createElement("div");
  wrap.className = "robot-log";
  const heading = document.createElement("div");
  heading.className = "robot-log-heading mono";
  heading.textContent = "UART \u00b7 Pi \u2192 Arduino";
  const list = document.createElement("ol");
  list.className = "robot-log-list mono";
  wrap.appendChild(heading);
  wrap.appendChild(list);
  return {
    el: wrap,
    render(entries) {
      list.innerHTML = "";
      entries
        .slice()
        .reverse()
        .forEach((entry) => {
          const li = document.createElement("li");
          const hex = document.createElement("span");
          hex.className = "robot-log-hex";
          hex.textContent = entry.hex;
          const label = document.createElement("span");
          label.className = "robot-log-label";
          label.textContent = entry.label;
          li.appendChild(hex);
          li.appendChild(label);
          list.appendChild(li);
        });
    },
  };
}

export function mount(frame) {
  const wrap = document.createElement("div");
  wrap.className = "robot-demo";
  frame.appendChild(wrap);

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "robot-canvas-wrap";
  wrap.appendChild(canvasWrap);

  const { canvas, ctx } = createCanvas(canvasWrap, CANVAS_W, CANVAS_H, { dprCap: 2 });
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${CANVAS_W} / ${CANVAS_H}`;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Top-down robot scene: click or tap to place a bottle for the robot to detect and collect");

  const side = document.createElement("div");
  side.className = "robot-side";
  wrap.appendChild(side);

  const logPanel = buildLogPanel();
  side.appendChild(logPanel.el);

  const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const uart = createUartLog(7);

  const scene = createScene(CANVAS_W, CANVAS_H, {
    reducedMotion: reducedMotionMQ.matches,
    onCommand(name, arg) {
      uart.send(CMD[name], arg);
      logPanel.render(uart.getEntries());
    },
    onCollect() {},
  });

  let colors = readTheme();
  const themeObserver = new MutationObserver(() => {
    colors = readTheme();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function canvasPointFromEvent(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function tryPlaceBottle(x, y) {
    if (y > CANVAS_H - 30) return;
    // Don't allow placing bottles directly on top of the robot
    const rPos = scene.getRobotPos();
    if (Math.hypot(x - rPos.x, y - rPos.y) < 50) return;
    scene.spawnBottle(x, y);
  }

  canvas.addEventListener("click", (e) => {
    const p = canvasPointFromEvent(e.clientX, e.clientY);
    tryPlaceBottle(p.x, p.y);
  });

  const loop = createLoop(
    (dtMs) => {
      scene.update(dtMs);
      scene.draw(ctx, colors);
    },
    { fixedStep: 1000 / 50 }
  );

  scene.draw(ctx, colors);
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
