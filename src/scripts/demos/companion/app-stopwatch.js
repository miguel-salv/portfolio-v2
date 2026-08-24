import { btn, cloudRoom, label, page, pulseLabel, roomPips, screen, stopPulse, worldSky } from "./components/ui.js";
import { createStrip, createStripCentered, pulseColon } from "./phos-strip.js";
import { createStepper } from "./stepper.js";
import { hidePage, jumpPages, pageBusy, setSkyY, showPage, slidePages } from "./motion.js";
import { playUiClick, playUiSwipe, startAlarmSong, stopAlarmSong } from "./audio.js";
import {
  BTN_GRAY, BTN_GREEN, BTN_ORANGE, BTN_RED, GESTURE_SLIDE_DOWN, GESTURE_SLIDE_UP,
  PHOS_CREAM, PHOS_GOLD, PHOS_PINK, SHEET_BTN_Y, STAGE_BTN_H, STAGE_BTN_Y, STRIP_GAP, W,
} from "./theme.js";

const PREFS_KEY = "kirby-demo-tmr";

export function createStopwatchApp() {
  let view = "stopwatch";
  let busy = false;
  let swRunning = false;
  let swStart = 0;
  let swAccum = 0;

  const saved = loadTimerPrefs();
  const minState = { value: saved?.min ?? 0, min: 0, max: 99, onChange: saveTimer };
  const secState = { value: saved?.sec ?? 5, min: 0, max: 59, onChange: saveTimer };
  let tmrState = "idle";
  let tmrEnd = 0;
  let setFlash = 0;
  let onFired = null;

  const root = screen();
  const sky = worldSky(root, 2);

  const watch = page(root, "watch");
  cloudRoom(watch, 2);
  roomPips(watch, 2);
  const swTime = createStripCentered(watch, 48, "00:00.00", 2);
  pulseColon(swTime.imgs[2]);
  const startBtn = btn(watch, "Start", 16, STAGE_BTN_Y, 136, STAGE_BTN_H, BTN_GREEN, toggleSw);
  btn(watch, "Reset", 168, STAGE_BTN_Y, 136, STAGE_BTN_H, BTN_GRAY, resetSw);
  label(watch, "^ TIMER", { size: 8, color: PHOS_PINK, right: 8, y: 8 });

  const timer = page(root, "timer");
  hidePage(timer);

  const rollers = document.createElement("div");
  rollers.className = "kirby-page";
  rollers.style.position = "absolute";
  rollers.style.inset = "0";
  rollers.style.height = "176px";
  timer.appendChild(rollers);

  const stw = 36 * 2 + 8;
  const stg = 40;
  const stx = Math.floor((W - stw - stg - stw) / 2);
  label(rollers, "MIN", { size: 8, color: PHOS_CREAM, letterSpace: 0, x: stx + Math.floor((stw - 24) / 2), y: 6 });
  label(rollers, "SEC", { size: 8, color: PHOS_CREAM, letterSpace: 0, x: stx + stw + stg + Math.floor((stw - 24) / 2), y: 6 });
  createStepper(rollers, stx, 26, minState);
  createStepper(rollers, stx + stw + stg, 26, secState);
  const tmrColon = document.createElement("img");
  tmrColon.className = "kirby-spr";
  tmrColon.src = "/assets/demos/companion/digit-colon.png";
  tmrColon.width = 14;
  tmrColon.height = 64;
  tmrColon.style.left = `${stx + stw + Math.floor((stg - 14) / 2)}px`;
  tmrColon.style.top = `${26 + 24 + 16}px`;
  rollers.appendChild(tmrColon);
  pulseColon(tmrColon);

  const count = document.createElement("div");
  count.className = "kirby-page";
  count.style.position = "absolute";
  count.style.inset = "0";
  timer.appendChild(count);
  hidePage(count);
  const countdown = createStripCentered(count, 64, "00:00", STRIP_GAP);
  pulseColon(countdown.imgs[2]);

  const tmrStart = btn(timer, "Start", 48, SHEET_BTN_Y, 224, STAGE_BTN_H, BTN_GREEN, toggleTmr);
  label(timer, "v WATCH", { size: 8, color: PHOS_PINK, right: 8, y: 8 });

  const alert = page(root, "tmr-alert");
  hidePage(alert);
  const wake = label(alert, "TIME UP", { size: 8, color: PHOS_GOLD, centerX: true, y: 8 });
  const alertTime = createStripCentered(alert, 48, "00:00", STRIP_GAP);
  pulseColon(alertTime.imgs[2]);
  btn(alert, "Dismiss", 70, STAGE_BTN_Y, 180, 44, BTN_RED, dismissFiring);

  function fmtCs(ms) {
    const cs = Math.floor((ms / 10) % 100);
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / 60000) % 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }

  function fmtMmSs(ms) {
    let s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    s %= 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function saveTimer() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ min: minState.value, sec: secState.value }));
    } catch { /* ignore */ }
  }

  function updateStart() {
    if (swRunning) {
      startBtn.relabel("Stop");
      startBtn.recolor(BTN_ORANGE);
    } else {
      startBtn.relabel(swAccum > 0 ? "Resume" : "Start");
      startBtn.recolor(BTN_GREEN);
    }
  }

  function toggleSw() {
    if (swRunning) {
      swAccum += Date.now() - swStart;
      swRunning = false;
    } else {
      swStart = Date.now();
      swRunning = true;
    }
    updateStart();
  }

  function resetSw() {
    swRunning = false;
    swAccum = 0;
    swTime.set("00:00.00");
    updateStart();
  }

  function showRollers(on) {
    if (on) {
      showPage(rollers, 0);
      hidePage(count);
    } else {
      hidePage(rollers);
      showPage(count, 0);
    }
  }

  function resetTmr() {
    if (tmrState === "fired") {
      stopAlarmSong();
      hidePage(alert);
    }
    tmrState = "idle";
    showRollers(true);
    tmrStart.relabel("Start");
    tmrStart.recolor(BTN_GREEN);
    countdown.set(fmtMmSs((minState.value * 60 + secState.value) * 1000));
  }

  function toggleTmr() {
    if (tmrState === "idle") {
      const total = (minState.value * 60 + secState.value) * 1000;
      if (!total) {
        tmrStart.relabel("SET TIME");
        tmrStart.recolor(BTN_ORANGE);
        clearTimeout(setFlash);
        setFlash = window.setTimeout(() => {
          if (tmrState === "idle") {
            tmrStart.relabel("Start");
            tmrStart.recolor(BTN_GREEN);
          }
        }, 900);
        return;
      }
      tmrEnd = Date.now() + total;
      tmrState = "running";
      showRollers(false);
      tmrStart.relabel("Cancel");
      tmrStart.recolor(BTN_ORANGE);
    } else {
      resetTmr();
    }
  }

  function dismissFiring() {
    if (tmrState !== "fired") return;
    stopAlarmSong();
    stopPulse(wake);
    hidePage(alert);
    jumpPages({
      hide: view === "stopwatch" ? timer : watch,
      show: view === "stopwatch" ? watch : timer,
      sky,
      upper: view === "timer",
    });
    tmrState = "idle";
    showRollers(true);
    tmrStart.relabel("Start");
    tmrStart.recolor(BTN_GREEN);
    countdown.set(fmtMmSs((minState.value * 60 + secState.value) * 1000));
  }

  function showView(next) {
    if (next === view || busy || pageBusy(watch, timer)) return;
    const from = view === "stopwatch" ? watch : timer;
    const to = next === "stopwatch" ? watch : timer;
    view = next;
    busy = true;
    slidePages({ from, to, sky, upper: next === "timer", onBusy: (v) => { busy = v; } });
  }

  function handleSwipe(g) {
    if (tmrState === "fired") return;
    if (busy || pageBusy(watch, timer)) return;
    if (g === GESTURE_SLIDE_UP && view === "stopwatch") {
      showView("timer");
      playUiSwipe();
    } else if (g === GESTURE_SLIDE_DOWN && view === "timer") {
      showView("stopwatch");
      playUiSwipe();
    }
  }

  function tick() {
    if (swRunning) swTime.set(fmtCs(swAccum + Date.now() - swStart));
    if (tmrState === "running") {
      const rem = tmrEnd - Date.now();
      if (rem <= 0) {
        tmrState = "fired";
        countdown.set("00:00");
        alertTime.set(`${String(minState.value).padStart(2, "0")}:${String(secState.value).padStart(2, "0")}`);
        hidePage(watch);
        hidePage(timer);
        setSkyY(sky, 0);
        showPage(alert, 0);
        pulseLabel(wake);
        startAlarmSong();
        onFired?.();
      } else {
        countdown.set(fmtMmSs(rem));
      }
    }
  }

  let tickId = setInterval(tick, 50);
  resetTmr();

  return {
    el: root,
    handleSwipe,
    isTimerFiring: () => tmrState === "fired",
    isLowerView: () => view === "stopwatch" && tmrState !== "fired" && !busy,
    setOnFired(fn) { onFired = fn; },
    pause() {
      if (tickId == null) return;
      clearInterval(tickId);
      tickId = null;
    },
    resume() {
      if (tickId != null) return;
      tick();
      tickId = setInterval(tick, 50);
    },
  };
}

function loadTimerPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.min < 0 || data.min > 99 || data.sec < 0 || data.sec > 59) return null;
    return data;
  } catch {
    return null;
  }
}
