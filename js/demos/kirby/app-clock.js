import { el, btn, label, centerLabel, stars, horizGradBg } from "./components/ui.js";
import { FONT_CLOCK, FONT_LARGE, FONT_MEDIUM, FONT_SMALL, KIRBY_ACCENT_WARM, KIRBY_TEXT, KIRBY_TEXT_DIM, BTN_GREEN, BTN_GRAY, BTN_RED, KIRBY_ALERT_TOP, KIRBY_ALERT_BOT } from "./theme.js";
import { GESTURE_SLIDE_UP, GESTURE_SLIDE_DOWN } from "./theme.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PREFS_KEY = "kirby-demo-alm";

export function createClockApp() {
  let view = "clock";
  let almHour = 7;
  let almMin = 0;
  let almActive = false;
  let almFiring = false;
  let almLastFired = -1;
  let almSeeded = false;
  let almUserModified = false;

  const saved = loadPrefs();
  if (saved) {
    almHour = saved.hour;
    almMin = saved.min;
    almActive = saved.on;
    almUserModified = true;
  }

  const screen = el("div", "kirby-screen");
  horizGradBg(screen);

  const clockCont = el("div", "kirby-subscreen");
  stars(clockCont);
  const timeLbl = centerLabel(clockCont, "--:--", -18, { font: FONT_CLOCK, color: KIRBY_TEXT });
  const dateLbl = centerLabel(clockCont, "---", 36, { font: FONT_MEDIUM, color: KIRBY_ACCENT_WARM });
  label(clockCont, "▲ Alarm", { font: FONT_SMALL, color: KIRBY_TEXT_DIM, center: true, bottom: 4 });

  const alarmCont = el("div", "kirby-subscreen kirby-hidden");
  stars(alarmCont);
  label(alarmCont, "Hour", { font: FONT_SMALL, color: KIRBY_ACCENT_WARM, x: 96, y: 36 });
  label(alarmCont, "Min", { font: FONT_SMALL, color: KIRBY_ACCENT_WARM, x: 190, y: 36 });

  const hourRoller = createRoller(alarmCont, 24, almHour, 84, 60, (v) => {
    almHour = v;
    almUserModified = true;
    savePrefs();
  });
  const minRoller = createRoller(alarmCont, 60, almMin, 172, 60, (v) => {
    almMin = v;
    almUserModified = true;
    savePrefs();
  });

  let toggleBtn;
  toggleBtn = btn(alarmCont, "Off", 64, 172, 192, 32, BTN_GRAY, () => {
    if (almFiring) return;
    almActive = !almActive;
    syncToggle();
    savePrefs();
  });
  label(alarmCont, "▼ Clock", { font: FONT_SMALL, color: KIRBY_TEXT_DIM, center: true, bottom: 4 });

  const alertCont = el("div", "kirby-subscreen kirby-alert kirby-hidden");
  alertCont.style.background = `linear-gradient(180deg, ${KIRBY_ALERT_TOP}, ${KIRBY_ALERT_BOT})`;
  centerLabel(alertCont, "Wake up!", -28, { font: FONT_LARGE, color: KIRBY_TEXT });
  btn(alertCont, "Dismiss", 70, 168, 180, 44, BTN_RED, () => stopFiring());

  screen.append(clockCont, alarmCont, alertCont);

  function syncToggle() {
    toggleBtn.textContent = almActive ? "Armed" : "Off";
    toggleBtn.style.background = almActive
      ? `linear-gradient(180deg, ${BTN_GREEN}, rgb(70, 180, 100))`
      : `linear-gradient(180deg, ${BTN_GRAY}, rgb(70, 60, 90))`;
  }

  function showView(v) {
    view = v;
    clockCont.classList.toggle("kirby-hidden", v !== "clock");
    alarmCont.classList.toggle("kirby-hidden", v !== "alarm");
  }

  function stopFiring() {
    almFiring = false;
    almActive = false;
    almLastFired = -1;
    alertCont.classList.add("kirby-hidden");
    syncToggle();
    savePrefs();
  }

  function seedAlarmFromTime() {
    if (almSeeded || almUserModified) return;
    const now = new Date();
    almHour = now.getHours();
    almMin = now.getMinutes();
    hourRoller.querySelectorAll(".kirby-roller-item").forEach((it, idx) => {
      it.classList.toggle("selected", idx === almHour);
    });
    minRoller.querySelectorAll(".kirby-roller-item").forEach((it, idx) => {
      it.classList.toggle("selected", idx === almMin);
    });
    almSeeded = true;
  }

  function tick() {
    seedAlarmFromTime();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    timeLbl.textContent = `${hh}:${mm}`;
    dateLbl.textContent = `${DAY_NAMES[now.getDay()]} ${now.getDate()}`;

    const nowEnc = now.getHours() * 60 + now.getMinutes();
    const almEnc = almHour * 60 + almMin;
    if (almActive && !almFiring && nowEnc === almEnc && now.getSeconds() < 30 && almLastFired !== nowEnc) {
      almLastFired = nowEnc;
      almFiring = true;
      alertCont.classList.remove("kirby-hidden");
    }
  }

  function handleSwipe(g) {
    if (almFiring) { stopFiring(); return; }
    if (g === GESTURE_SLIDE_UP && view === "clock") showView("alarm");
    else if (g === GESTURE_SLIDE_DOWN && view === "alarm") showView("clock");
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        hour: almHour,
        min: almMin,
        on: almActive,
      }));
    } catch { /* ignore */ }
  }

  syncToggle();
  setInterval(tick, 1000);
  tick();

  return { el: screen, handleSwipe, showClock: () => showView("clock") };
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.hour < 0 || data.hour > 23 || data.min < 0 || data.min > 59) return null;
    return data;
  } catch {
    return null;
  }
}

function createRoller(parent, count, selected, x, y, onChange) {
  const wrap = el("div", "kirby-roller");
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;

  const list = el("div", "kirby-roller-list");
  const items = [];
  for (let i = 0; i < count; i++) {
    const item = el("div", "kirby-roller-item");
    item.textContent = String(i).padStart(2, "0");
    if (i === selected) item.classList.add("selected");
    item.addEventListener("click", () => {
      items.forEach((it, idx) => it.classList.toggle("selected", idx === i));
      onChange(i);
      list.scrollTop = Math.max(0, i * 28 - 28);
    });
    items.push(item);
    list.appendChild(item);
  }
  wrap.appendChild(list);
  parent.appendChild(wrap);
  list.scrollTop = Math.max(0, selected * 28 - 28);
  return wrap;
}
