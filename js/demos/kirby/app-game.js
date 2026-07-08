import { el, btn, centerLabel, stars, horizGradBg } from "./components/ui.js";
import {
  FONT_SMALL, FONT_MEDIUM, FONT_LARGE,
  KIRBY_TEXT, KIRBY_ACCENT_WARM, KIRBY_BG_DEEP, KIRBY_BG_DEEP2,
  BTN_GREEN, BTN_GRAY, W, H,
} from "./theme.js";

const PREFS_KEY = "kirby-demo-star-catch";
const KIRBY_W = 58;
const KIRBY_BODY = 44;
const KIRBY_BODY_X = 7;
const KIRBY_Y = 124;
const KIRBY_MIN_X = 8;
const KIRBY_MAX_X = 254;
const STAR_SIZE = 20;
const CATCH_DIST = 42;
const LIVES_MAX = 3;
const GEM_SZ = 11;
const GEM_GAP = 6;

const BG_STAR_X = [22, 88, 155, 220, 288, 48, 125, 195, 265, 110];
const BG_STAR_Y = [24, 40, 56, 72, 88, 104, 120, 136, 152, 172];
const STAR_COLORS = [
  "rgb(255, 230, 100)",
  "rgb(180, 230, 255)",
  "rgb(200, 255, 160)",
  "rgb(255, 180, 230)",
];

export function createGameApp() {
  let state = "idle";
  let score = 0;
  let lives = LIVES_MAX;
  let speed = 3;
  let kirbyX = (W - KIRBY_W) / 2;
  let lastScore = loadPrefs().last;
  let highScore = loadPrefs().high;

  const screen = el("div", "kirby-screen");
  screen.style.background = `linear-gradient(180deg, ${KIRBY_BG_DEEP}, ${KIRBY_BG_DEEP2})`;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.className = "kirby-game-canvas";
  screen.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const overlay = el("div", "kirby-game-overlay");
  horizGradBg(overlay, true);
  stars(overlay);
  const overlayLbl = centerLabel(overlay, "Star Catcher", -62, { font: FONT_LARGE, color: KIRBY_TEXT });
  const lastLbl = centerLabel(overlay, `Last: ${lastScore}`, -22, { font: FONT_MEDIUM, color: KIRBY_ACCENT_WARM });
  const highLbl = centerLabel(overlay, `High: ${highScore}`, 10, { font: FONT_MEDIUM, color: KIRBY_ACCENT_WARM });
  const playBtn = btn(overlay, "Play", 90, 168, 140, 44, BTN_GREEN, startGame);
  screen.appendChild(overlay);

  const quitBtn = btn(screen, "Quit", 88, 188, 144, 36, BTN_GRAY, quitGame);
  quitBtn.classList.add("kirby-hidden");

  const fallingStars = [];
  for (let i = 0; i < 2; i++) {
    fallingStars.push({ x: randStarX(i), y: -36 - i * 30, active: false });
  }

  function randStarX(idx) {
    const laneW = (W - 30) / 2;
    return 15 + idx * laneW + Math.floor(Math.random() * laneW);
  }

  function spawnStar(i) {
    fallingStars[i].x = randStarX(i);
    fallingStars[i].y = -36 - i * 30;
    fallingStars[i].active = true;
  }

  function refreshOverlayScores() {
    lastLbl.textContent = `Last: ${lastScore}`;
    highLbl.textContent = `High: ${highScore}`;
  }

  function showOverlay(msg, btnLabel) {
    overlayLbl.textContent = msg;
    refreshOverlayScores();
    playBtn.textContent = btnLabel;
    overlay.classList.remove("kirby-hidden");
    quitBtn.classList.add("kirby-hidden");
  }

  function hideOverlay() {
    overlay.classList.add("kirby-hidden");
    quitBtn.classList.remove("kirby-hidden");
  }

  function startGame() {
    state = "running";
    score = 0;
    lives = LIVES_MAX;
    speed = 3;
    kirbyX = (W - KIRBY_W) / 2;
    fallingStars.forEach((s, i) => spawnStar(i));
    hideOverlay();
  }

  function quitGame() {
    state = "idle";
    fallingStars.forEach((s) => { s.active = false; });
    showOverlay("Star Catcher", "Play");
  }

  function gameOver() {
    state = "over";
    lastScore = score;
    savePrefs(lastScore, highScore);
    if (score > highScore) {
      highScore = score;
      savePrefs(lastScore, highScore);
    }
    showOverlay("Game Over", "Play Again");
  }

  function handleTouch(touchX) {
    if (state !== "running") return;
    let newX = touchX - KIRBY_W / 2;
    if (newX < KIRBY_MIN_X) newX = KIRBY_MIN_X;
    if (newX > KIRBY_MAX_X) newX = KIRBY_MAX_X;
    kirbyX = newX;
  }

  function drawBgStars() {
    ctx.fillStyle = "rgb(200, 190, 255)";
    ctx.font = FONT_SMALL;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 10; i++) {
      ctx.fillText("*", BG_STAR_X[i], BG_STAR_Y[i] + 12);
    }
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    ctx.fillStyle = "rgba(200, 170, 255, 0.3)";
    ctx.fillRect(0, KIRBY_Y + 46, W, 2);
  }

  function drawLifeGems() {
    const rightX = W - 8 - GEM_SZ;
    for (let i = 0; i < LIVES_MAX; i++) {
      const x = rightX - i * (GEM_SZ + GEM_GAP);
      const lost = LIVES_MAX - lives;
      if (i < lost) continue;
      const g = ctx.createLinearGradient(x, 9, x, 9 + GEM_SZ);
      g.addColorStop(0, "rgb(255, 95, 130)");
      g.addColorStop(1, "rgb(200, 40, 70)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + GEM_SZ / 2, 9 + GEM_SZ / 2, GEM_SZ / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 200, 210, 0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawFallingStar(x, y, colorIdx) {
    ctx.fillStyle = STAR_COLORS[colorIdx % STAR_COLORS.length];
    ctx.font = "600 20px Montserrat, sans-serif";
    ctx.fillText("*", x, y + STAR_SIZE);
  }

  function drawKirby(x, y) {
    const bx = x + KIRBY_BODY_X;
    const bodyG = ctx.createLinearGradient(bx, y, bx, y + KIRBY_BODY);
    bodyG.addColorStop(0, "rgb(255, 150, 195)");
    bodyG.addColorStop(1, "rgb(255, 100, 160)");
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.arc(bx + KIRBY_BODY / 2, y + KIRBY_BODY / 2, KIRBY_BODY / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 200, 220, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const drawEye = (ex) => {
      const eg = ctx.createLinearGradient(ex, y + 10, ex, y + 20);
      eg.addColorStop(0, "rgb(95, 110, 175)");
      eg.addColorStop(1, "rgb(38, 32, 72)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.ellipse(ex + 4, y + 15, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex + 5, y + 13, 2, 0, Math.PI * 2);
      ctx.fill();
    };
    drawEye(bx + 7);
    drawEye(bx + 25);

    ctx.fillStyle = "rgba(255, 80, 120, 0.6)";
    ctx.beginPath();
    ctx.ellipse(bx + 7, y + 22, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bx + 33, y + 22, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgb(70, 35, 55)";
    ctx.beginPath();
    ctx.arc(bx + 20, y + 30, 4, 0, Math.PI * 2);
    ctx.fill();

    const drawHand = (hx) => {
      const hg = ctx.createLinearGradient(hx, y + 13, hx, y + 24);
      hg.addColorStop(0, "rgb(255, 145, 195)");
      hg.addColorStop(1, "rgb(255, 105, 165)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx + 5.5, y + 18.5, 5.5, 0, Math.PI * 2);
      ctx.fill();
    };
    drawHand(x + KIRBY_BODY_X - 6);
    drawHand(x + KIRBY_BODY_X + 40);

    const drawFoot = (fx) => {
      const fg = ctx.createLinearGradient(fx, y + 36, fx, y + 46);
      fg.addColorStop(0, "rgb(245, 110, 160)");
      fg.addColorStop(1, "rgb(205, 65, 120)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(fx + 7.5, y + 41, 7.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    drawFoot(x + KIRBY_BODY_X - 3);
    drawFoot(x + KIRBY_BODY_X + 31);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (state !== "running") return;

    drawBgStars();
    ctx.fillStyle = KIRBY_ACCENT_WARM;
    ctx.font = FONT_SMALL;
    ctx.fillText(`Score: ${score}`, 8, 18);
    drawLifeGems();
    drawGround();

    fallingStars.forEach((s, i) => {
      if (!s.active) return;
      drawFallingStar(s.x, s.y, i);
    });

    drawKirby(kirbyX, KIRBY_Y);
  }

  function tick() {
    if (state === "running") {
      const kirbyCx = kirbyX + KIRBY_BODY_X + KIRBY_BODY / 2;
      const kirbyCy = KIRBY_Y + KIRBY_BODY / 2;

      fallingStars.forEach((s, i) => {
        if (!s.active) return;
        s.y += speed;
        const starCx = s.x + STAR_SIZE / 2;
        const starCy = s.y + STAR_SIZE / 2;
        const dx = kirbyCx - starCx;
        const dy = kirbyCy - starCy;
        const caught = (dx * dx + dy * dy) < (CATCH_DIST * CATCH_DIST)
          && s.y > (KIRBY_Y - STAR_SIZE);

        if (caught) {
          score++;
          if (score % 10 === 0) speed++;
          s.active = false;
          setTimeout(() => spawnStar(i), 200);
        } else if (s.y > H) {
          lives--;
          s.active = false;
          if (lives <= 0) gameOver();
          else setTimeout(() => spawnStar(i), 300);
        }
      });
    }
    draw();
    requestAnimationFrame(tick);
  }

  showOverlay("Star Catcher", "Play");
  requestAnimationFrame(tick);

  return {
    el: screen,
    isRunning: () => state === "running",
    handleSwipe: () => {},
    handleTouch,
  };
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { last: 0, high: 0 };
    const data = JSON.parse(raw);
    return { last: Number(data.last) || 0, high: Number(data.high) || 0 };
  } catch {
    return { last: 0, high: 0 };
  }
}

function savePrefs(last, high) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ last, high }));
  } catch { /* ignore */ }
}
