import { btn, cloudRoom, label, page, playDeck, roomPips, screen, spr, stageStar, worldSky } from "./components/ui.js";
import { createKirbyActor } from "./kirby-actor.js";
import { createStripCentered } from "./phos-strip.js";
import { hidePage, showPage } from "./motion.js";
import {
  playCatchSound, playGameHighscore, playGameOverSound, playGameSpeedup, playGameStart,
  playMissSound, startGameSong, stopGameSong,
} from "./audio.js";
import { BTN_GRAY, BTN_GREEN, PHOS_CREAM, PHOS_GOLD, PHOS_PINK, STAGE_BTN_H, STAGE_BTN_Y, W } from "./theme.js";
import { pulseLabel, stopPulse } from "./components/ui.js";

const PREFS_KEY = "kirby-demo-star-catch";
const KIRBY_W = 64;
const KIRBY_Y = 132;
const KIRBY_MIN_X = 8;
const KIRBY_MAX_X = 320 - KIRBY_W - 8;
const STAR_SIZE = 16;
const CATCH_DIST = 42;
const LIVES_MAX = 3;

export function createGameApp() {
  let state = "idle";
  let score = 0;
  let lives = LIVES_MAX;
  let speed = 3;
  let kirbyX = (W - KIRBY_W) / 2;
  let lastScore = loadPrefs().last;
  let highScore = loadPrefs().high;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const root = screen();
  worldSky(root, 3);

  const world = page(root, "play");
  hidePage(world);
  playDeck(world);
  const scoreLbl = label(world, "000", { size: 16, color: PHOS_GOLD, letterSpace: 1, x: 8, y: 8 });
  const lifeDots = [];
  const gem = 8;
  const gap = 4;
  const rightX = 320 - 8 - gem;
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "kirby-life";
    dot.style.left = `${rightX - i * (gem + gap)}px`;
    dot.style.top = "8px";
    world.appendChild(dot);
    lifeDots.push(dot);
  }
  const actor = createKirbyActor(world, kirbyX, KIRBY_Y, false);
  const stars = [0, 1].map(() => {
    const img = spr("warp-star.png", 0, -30, 16, 16);
    img.classList.add("kirby-hidden");
    world.appendChild(img);
    return { img, x: 0, y: -36, active: false };
  });
  const quitBtn = btn(world, "Quit", 112, 8, 96, 24, BTN_GRAY, quitGame);
  quitBtn.classList.add("kirby-hidden");

  const overlay = page(root, "menu");
  cloudRoom(overlay, 3);
  stageStar(overlay, 280, 168);
  roomPips(overlay, 3);
  const menuTitle = label(overlay, "STAR CATCHER", { size: 8, color: PHOS_CREAM, x: 8, y: 8 });
  const overTitle = label(overlay, "GAME OVER", { size: 16, color: PHOS_GOLD, letterSpace: 0, centerX: true, y: 16 });
  overTitle.classList.add("kirby-hidden");
  const overlayScore = createStripCentered(overlay, 48, "000");
  const overlayCap = label(overlay, "LAST 0", { size: 8, color: PHOS_CREAM, centerX: true, y: 120 });
  const dragLbl = label(overlay, "DRAG KIRBY", { size: 8, color: PHOS_PINK, right: 8, y: 8 });
  const playBtn = btn(overlay, "Play", 72, STAGE_BTN_Y, 176, STAGE_BTN_H, BTN_GREEN, startGame);

  function randStarX(idx) {
    const laneW = (320 - 30) / 2;
    return 15 + idx * laneW + Math.floor(Math.random() * laneW);
  }

  function spawnStar(i) {
    stars[i].x = randStarX(i);
    stars[i].y = -36 - i * 30;
    stars[i].active = true;
    stars[i].img.style.left = `${stars[i].x}px`;
    stars[i].img.style.top = `${stars[i].y}px`;
    stars[i].img.classList.remove("kirby-hidden");
  }

  function setScore(n) {
    scoreLbl.setText(String(Math.max(0, Math.min(999, n))).padStart(3, "0"));
  }

  let flashId = 0;
  function flashScore() {
    scoreLbl.recolor(PHOS_CREAM);
    clearTimeout(flashId);
    flashId = window.setTimeout(() => scoreLbl.recolor(PHOS_GOLD), 140);
  }

  function refreshLives() {
    const lost = LIVES_MAX - lives;
    lifeDots.forEach((dot, i) => dot.classList.toggle("kirby-hidden", i < lost));
  }

  function refreshOverlay() {
    const shown = state === "over" ? lastScore : highScore;
    overlayScore.set(String(Math.max(0, Math.min(999, shown))).padStart(3, "0"));
    overlayCap.setText(state === "over" ? `HIGH ${highScore}` : `LAST ${lastScore}`);
    overlayCap.style.left = `${Math.floor((W - overlayCap.width) / 2)}px`;
  }

  function showOverlay(msg, btnLabel) {
    if (state === "over") {
      menuTitle.classList.add("kirby-hidden");
      overTitle.classList.remove("kirby-hidden");
      pulseLabel(overTitle);
      dragLbl.classList.add("kirby-hidden");
    } else {
      stopPulse(overTitle);
      overTitle.classList.add("kirby-hidden");
      menuTitle.classList.remove("kirby-hidden");
      menuTitle.setText(msg);
      dragLbl.classList.remove("kirby-hidden");
    }
    refreshOverlay();
    playBtn.relabel(btnLabel);
    hidePage(world);
    showPage(overlay, 0);
    quitBtn.classList.add("kirby-hidden");
  }

  function startGame() {
    score = 0;
    lives = LIVES_MAX;
    speed = 3;
    kirbyX = (W - KIRBY_W) / 2;
    actor.setX(kirbyX);
    setScore(0);
    refreshLives();
    stars.forEach((_, i) => spawnStar(i));
    state = "running";
    stopPulse(overTitle);
    hidePage(overlay);
    showPage(world, 0);
    quitBtn.classList.remove("kirby-hidden");
    playGameStart();
    startGameSong();
    if (!reduced) startLoop();
  }

  function quitGame() {
    state = "idle";
    stars.forEach((s) => {
      s.active = false;
      s.img.classList.add("kirby-hidden");
    });
    stopGameSong();
    showOverlay("STAR CATCHER", "Play");
  }

  function gameOver(newHigh) {
    state = "over";
    stars.forEach((s) => s.img.classList.add("kirby-hidden"));
    lastScore = score;
    savePrefs(lastScore, highScore);
    if (newHigh) {
      highScore = score;
      savePrefs(lastScore, highScore);
    }
    stopGameSong();
    if (newHigh) playGameHighscore();
    else playGameOverSound();
    showOverlay("GAME OVER", "Play Again");
    stopLoop();
  }

  function handleTouch(touchX) {
    if (state !== "running") return;
    let nx = touchX - KIRBY_W / 2;
    if (nx < KIRBY_MIN_X) nx = KIRBY_MIN_X;
    if (nx > KIRBY_MAX_X) nx = KIRBY_MAX_X;
    kirbyX = nx;
    actor.setX(kirbyX);
  }

  let rafId = null;
  let lastTick = 0;

  function step() {
    if (state !== "running") return;
    const kirbyCx = kirbyX + KIRBY_W / 2;
    const kirbyCy = KIRBY_Y + 32;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (!s.active) continue;
      s.y += speed;
      s.img.style.top = `${s.y}px`;
      const dx = kirbyCx - (s.x + STAR_SIZE / 2);
      const dy = kirbyCy - (s.y + STAR_SIZE / 2);
      const caught = dx * dx + dy * dy < CATCH_DIST * CATCH_DIST && s.y > KIRBY_Y - STAR_SIZE;
      if (caught) {
        score += 1;
        setScore(score);
        flashScore();
        if (score % 10 === 0) {
          speed += 1;
          playGameSpeedup();
        } else {
          playCatchSound();
        }
        actor.catchHop();
        spawnStar(i);
      } else if (s.y > 240) {
        lives -= 1;
        refreshLives();
        playMissSound();
        if (lives <= 0) {
          const newHigh = score > highScore;
          gameOver(newHigh);
          return;
        }
        spawnStar(i);
      }
    }
  }

  function loop(now) {
    if (state !== "running") {
      rafId = null;
      return;
    }
    if (now - lastTick >= 33) {
      lastTick = now;
      step();
    }
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (reduced || rafId != null || state !== "running") return;
    lastTick = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  showOverlay("STAR CATCHER", "Play");

  return {
    el: root,
    isRunning: () => state === "running",
    isLowerView: () => state !== "running",
    handleSwipe: () => {},
    handleTouch,
    pause() {
      stopLoop();
    },
    resume() {
      startLoop();
    },
    destroy() {
      stopLoop();
      actor.destroy();
      stopGameSong();
    },
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
