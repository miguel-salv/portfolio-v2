import { el, btn, label, centerLabel, stars, horizGradBg } from "./components/ui.js";
import {
  FONT_LARGE, FONT_SMALL, KIRBY_TEXT, KIRBY_TEXT_DIM, KIRBY_ACCENT_WARM,
  BTN_GREEN, BTN_ORANGE, BTN_GRAY, BTN_RED,
  KIRBY_ALERT_TOP, KIRBY_ALERT_BOT,
} from "./theme.js";
import { GESTURE_SLIDE_UP, GESTURE_SLIDE_DOWN } from "./theme.js";
import { playUiSwipe, startAlarmSong, stopAlarmSong } from "./audio.js";

const PREFS_KEY = "kirby-demo-tmr";

export function createStopwatchApp() {
  let view = "stopwatch";
  let swRunning = false;
  let swStart = 0;
  let swAccum = 0;

  const saved = loadTimerPrefs();
  let tmrMin = saved?.min ?? 0;
  let tmrSec = saved?.sec ?? 5;
  let tmrState = "idle";
  let tmrEnd = 0;

  const screen = el("div", "kirby-screen");

  const swCont = el("div", "kirby-subscreen");
  horizGradBg(swCont);
  stars(swCont);
  const swLbl = centerLabel(swCont, "00:00.00", -22, { font: FONT_LARGE, color: KIRBY_TEXT });
  const startBtn = btn(swCont, "Start", 24, 162, 130, 40, BTN_GREEN, toggleSw);
  btn(swCont, "Reset", 166, 162, 130, 40, BTN_GRAY, resetSw);
  label(swCont, "▲ Timer", { font: FONT_SMALL, color: KIRBY_TEXT_DIM, center: true, bottom: 4 });

  const tmrCont = el("div", "kirby-subscreen kirby-hidden");
  horizGradBg(tmrCont);
  stars(tmrCont);

  const rollersCont = el("div", "kirby-tmr-rollers");
  label(rollersCont, "Min", { font: FONT_SMALL, color: KIRBY_ACCENT_WARM, x: 98, y: 6 });
  label(rollersCont, "Sec", { font: FONT_SMALL, color: KIRBY_ACCENT_WARM, x: 192, y: 6 });
  const minR = miniRoller(rollersCont, 100, tmrMin, (v) => { tmrMin = v; saveTimerPrefs(); });
  minR.style.left = "76px";
  minR.style.top = "28px";
  label(rollersCont, ":", { font: FONT_LARGE, color: KIRBY_TEXT, x: 154, y: 44 });
  const secR = miniRoller(rollersCont, 60, tmrSec, (v) => { tmrSec = v; saveTimerPrefs(); });
  secR.style.left = "172px";
  secR.style.top = "28px";
  tmrCont.appendChild(rollersCont);

  const countdownLbl = centerLabel(tmrCont, fmtMmSs((tmrMin * 60 + tmrSec) * 1000), -18, { font: FONT_LARGE, color: KIRBY_TEXT });
  countdownLbl.classList.add("kirby-hidden");
  const tmrStartBtn = btn(tmrCont, "Start", 24, 162, 272, 40, BTN_GREEN, toggleTmr);
  label(tmrCont, "▼ Stopwatch", { font: FONT_SMALL, color: KIRBY_TEXT_DIM, center: true, bottom: 4 });

  const alertCont = el("div", "kirby-subscreen kirby-alert kirby-hidden");
  alertCont.style.background = `linear-gradient(180deg, ${KIRBY_ALERT_TOP}, ${KIRBY_ALERT_BOT})`;
  centerLabel(alertCont, "Time's up!", -28, { font: FONT_LARGE, color: KIRBY_TEXT });
  btn(alertCont, "Dismiss", 40, 154, 240, 56, BTN_RED, dismissTmr);

  screen.append(swCont, tmrCont, alertCont);

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

  function saveTimerPrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ min: tmrMin, sec: tmrSec }));
    } catch { /* ignore */ }
  }

  function toggleSw() {
    if (swRunning) {
      swAccum += Date.now() - swStart;
      swRunning = false;
      startBtn.textContent = swAccum > 0 ? "Resume" : "Start";
      startBtn.style.background = `linear-gradient(180deg, ${BTN_GREEN}, rgb(70, 180, 100))`;
    } else {
      swStart = Date.now();
      swRunning = true;
      startBtn.textContent = "Stop";
      startBtn.style.background = `linear-gradient(180deg, ${BTN_ORANGE}, rgb(200, 130, 60))`;
    }
  }

  function resetSw() {
    swRunning = false;
    swAccum = 0;
    swLbl.textContent = "00:00.00";
    startBtn.textContent = "Start";
    startBtn.style.background = `linear-gradient(180deg, ${BTN_GREEN}, rgb(70, 180, 100))`;
  }

  function toggleTmr() {
    if (tmrState === "idle") {
      const total = (tmrMin * 60 + tmrSec) * 1000;
      if (!total) return;
      tmrEnd = Date.now() + total;
      tmrState = "running";
      rollersCont.classList.add("kirby-hidden");
      countdownLbl.classList.remove("kirby-hidden");
      tmrStartBtn.textContent = "Stop";
      tmrStartBtn.style.background = `linear-gradient(180deg, ${BTN_ORANGE}, rgb(200, 130, 60))`;
    } else {
      resetTmr();
    }
  }

  function resetTmr() {
    if (tmrState === "fired") dismissTmr();
    tmrState = "idle";
    rollersCont.classList.remove("kirby-hidden");
    countdownLbl.classList.add("kirby-hidden");
    countdownLbl.textContent = fmtMmSs((tmrMin * 60 + tmrSec) * 1000);
    tmrStartBtn.textContent = "Start";
    tmrStartBtn.style.background = `linear-gradient(180deg, ${BTN_GREEN}, rgb(70, 180, 100))`;
  }

  function dismissTmr() {
    alertCont.classList.add("kirby-hidden");
    stopAlarmSong();
    resetTmr();
  }

  function showView(v) {
    if (tmrState === "fired") { dismissTmr(); return; }
    view = v;
    swCont.classList.toggle("kirby-hidden", v !== "stopwatch");
    tmrCont.classList.toggle("kirby-hidden", v !== "timer");
  }

  function handleSwipe(g) {
    if (tmrState === "fired") { dismissTmr(); return; }
    if (g === GESTURE_SLIDE_UP && view === "stopwatch") {
      playUiSwipe();
      showView("timer");
    } else if (g === GESTURE_SLIDE_DOWN && view === "timer") {
      playUiSwipe();
      showView("stopwatch");
    }
  }

  function tick() {
    if (swRunning) swLbl.textContent = fmtCs(swAccum + Date.now() - swStart);
    if (tmrState === "running") {
      const rem = tmrEnd - Date.now();
      if (rem <= 0) {
        tmrState = "fired";
        countdownLbl.textContent = "00:00";
        alertCont.classList.remove("kirby-hidden");
        startAlarmSong();
      } else {
        countdownLbl.textContent = fmtMmSs(rem);
      }
    }
  }

  setInterval(tick, 50);

  return { el: screen, handleSwipe, isTimerFiring: () => tmrState === "fired" };
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

function miniRoller(parent, count, selected, onChange) {
  const wrap = el("div", "kirby-roller kirby-roller--sm");
  const list = el("div", "kirby-roller-list");
  const items = [];
  for (let i = 0; i < count; i++) {
    const item = el("div", "kirby-roller-item");
    item.textContent = String(i).padStart(2, "0");
    if (i === selected) item.classList.add("selected");
    item.addEventListener("click", () => {
      items.forEach((it, idx) => it.classList.toggle("selected", idx === i));
      onChange(i);
    });
    items.push(item);
    list.appendChild(item);
  }
  wrap.appendChild(list);
  parent.appendChild(wrap);
  return wrap;
}
