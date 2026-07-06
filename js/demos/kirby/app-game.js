import { el, btn, label } from "./components/ui.js";
import {
  FONT_SMALL, FONT_LARGE, KIRBY_TEXT, KIRBY_TEXT_DIM, KIRBY_ACCENT_WARM,
  KIRBY_UI_GRAD_PURPLE, KIRBY_UI_GRAD_BLUE, BTN_PINK, BTN_GREEN, BTN_GRAY,
  W, H,
} from "./theme.js";

const KIRBY_W = 58;
const KIRBY_H = 50;
const STAR_SIZE = 20;
const CATCH_DIST = 42;
const LIVES_MAX = 3;

export function createGameApp() {
  let state = "idle";
  let score = 0;
  let lives = LIVES_MAX;
  let speed = 3;
  let kirbyX = (W - KIRBY_W) / 2;
  let high = Number(localStorage.getItem("kirby-demo-high") || 0);

  const screen = el("div", "kirby-screen");
  screen.style.background = `linear-gradient(90deg, ${KIRBY_UI_GRAD_PURPLE}, ${KIRBY_UI_GRAD_BLUE})`;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.className = "kirby-game-canvas";
  screen.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const overlay = el("div", "kirby-game-overlay");
  const overlayLbl = label(overlay, "Catch the stars!", { font: FONT_LARGE, color: KIRBY_TEXT, center: true, y: 60 });
  const lastLbl = label(overlay, "", { font: FONT_SMALL, color: KIRBY_ACCENT_WARM, center: true, y: 110 });
  const highLbl = label(overlay, "", { font: FONT_SMALL, color: KIRBY_TEXT_DIM, center: true, y: 136 });
  btn(overlay, "Play", 70, 158, 90, 36, BTN_GREEN, startGame);
  btn(overlay, "Quit", 168, 158, 90, 36, BTN_GRAY, () => { state = "idle"; overlay.classList.remove("kirby-hidden"); });
  screen.appendChild(overlay);

  const stars = [];
  for (let i = 0; i < 2; i++) {
    stars.push({ x: randStarX(i), y: -36 - i * 30, active: false });
  }

  let dragging = false;
  let dragOffset = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (state !== "running") return;
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    const tx = (e.clientX - rect.left) * scale;
    if (tx >= kirbyX && tx <= kirbyX + KIRBY_W) {
      dragging = true;
      dragOffset = tx - kirbyX;
    }
  });
  window.addEventListener("mouseup", () => { dragging = false; });
  canvas.addEventListener("mousemove", (e) => {
    if (!dragging || state !== "running") return;
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    kirbyX = Math.max(8, Math.min(W - KIRBY_W - 8, (e.clientX - rect.left) * scale - dragOffset));
  });

  canvas.addEventListener("touchstart", (e) => {
    if (state !== "running") return;
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    const tx = (t.clientX - rect.left) * scale;
    if (tx >= kirbyX && tx <= kirbyX + KIRBY_W) {
      dragging = true;
      dragOffset = tx - kirbyX;
    }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (!dragging || state !== "running") return;
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    kirbyX = Math.max(8, Math.min(W - KIRBY_W - 8, (t.clientX - rect.left) * scale - dragOffset));
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchend", () => { dragging = false; }, { passive: true });

  function randStarX(idx) {
    const laneW = (W - 30) / 2;
    return 15 + idx * laneW + Math.floor(Math.random() * laneW);
  }

  function spawnStar(i) {
    stars[i].x = randStarX(i);
    stars[i].y = -36 - i * 30;
    stars[i].active = true;
  }

  function startGame() {
    state = "running";
    score = 0;
    lives = LIVES_MAX;
    speed = 3;
    kirbyX = (W - KIRBY_W) / 2;
    stars.forEach((s, i) => spawnStar(i));
    overlay.classList.add("kirby-hidden");
  }

  function gameOver() {
    state = "idle";
    if (score > high) {
      high = score;
      localStorage.setItem("kirby-demo-high", String(high));
    }
    overlayLbl.textContent = "Game Over";
    lastLbl.textContent = `Score: ${score}`;
    highLbl.textContent = `Best: ${high}`;
    overlay.classList.remove("kirby-hidden");
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < 10; i++) {
      ctx.fillRect((i * 37) % W, (i * 23) % H, 2, 2);
    }

    if (state === "running") {
      ctx.fillStyle = KIRBY_TEXT;
      ctx.font = FONT_SMALL;
      ctx.fillText(`Score: ${score}`, 12, 20);
      for (let i = 0; i < LIVES_MAX; i++) {
        ctx.fillStyle = i < lives ? BTN_PINK : "rgba(255,255,255,0.2)";
        ctx.beginPath();
        ctx.arc(W - 20 - i * 16, 14, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      stars.forEach((s) => {
        if (!s.active) return;
        drawStar(ctx, s.x, s.y);
      });

      drawKirby(ctx, kirbyX, 124);
    }
  }

  function tick() {
    if (state !== "running") { draw(); requestAnimationFrame(tick); return; }

    stars.forEach((s) => {
      if (!s.active) return;
      s.y += speed;
      const kcx = kirbyX + KIRBY_W / 2;
      const kcy = 124 + 36;
      const dist = Math.hypot(s.x + STAR_SIZE / 2 - kcx, s.y + STAR_SIZE / 2 - kcy);
      if (dist < CATCH_DIST) {
        score++;
        if (score % 10 === 0) speed++;
        s.active = false;
        setTimeout(() => spawnStar(stars.indexOf(s)), 200);
      } else if (s.y > H) {
        lives--;
        s.active = false;
        if (lives <= 0) gameOver();
        else setTimeout(() => spawnStar(stars.indexOf(s)), 300);
      }
    });

    draw();
    requestAnimationFrame(tick);
  }

  highLbl.textContent = `Best: ${high}`;
  requestAnimationFrame(tick);

  return {
    el: screen,
    isRunning: () => state === "running",
    handleSwipe: () => {},
  };
}

function drawKirby(ctx, x, y) {
  ctx.fillStyle = BTN_PINK;
  ctx.beginPath();
  ctx.ellipse(x + KIRBY_W / 2, y + 22, 22, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(255, 200, 220)";
  ctx.beginPath();
  ctx.ellipse(x + 18, y + 18, 6, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 40, y + 18, 6, 8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.ellipse(x + 22, y + 24, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 36, y + 24, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(220, 60, 80)";
  ctx.fillRect(x + 14, y + 36, 10, 8);
  ctx.fillRect(x + 34, y + 36, 10, 8);
}

function drawStar(ctx, x, y) {
  ctx.fillStyle = KIRBY_ACCENT_WARM;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? STAR_SIZE / 2 : STAR_SIZE / 5;
    const px = x + STAR_SIZE / 2 + Math.cos(a) * r;
    const py = y + STAR_SIZE / 2 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
