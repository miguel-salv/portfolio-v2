import { btn, cloudRoom, label, page, pulseLabel, roomPips, screen, stageStar, stopPulse, worldSky } from "./components/ui.js";
import { createKirbyActor } from "./kirby-actor.js";
import { createStrip, pulseColon, stripWidth } from "./phos-strip.js";
import { createStepper } from "./stepper.js";
import { hidePage, jumpPages, pageBusy, setSkyY, showPage, slidePages } from "./motion.js";
import { playUiClick, playUiSwipe, startAlarmSong, stopAlarmSong } from "./audio.js";
import {
  BTN_GRAY, BTN_GREEN, BTN_RED, GESTURE_SLIDE_DOWN, GESTURE_SLIDE_UP,
  PHOS_CREAM, PHOS_GOLD, PHOS_PINK, SHEET_BTN_Y, STAGE_BTN_H, STAGE_BTN_Y,
  STRIP_GAP, W,
} from "./theme.js";

const DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const PREFS_KEY = "kirby-demo-alm";

export function createClockApp() {
  let view = "clock";
  let hour24 = 7;
  let hour12 = 7;
  let isPm = false;
  let minute = 0;
  let armed = false;
  let firing = false;
  let lastFired = -1;
  let busy = false;
  let onFired = null;

  const saved = loadPrefs();
  if (saved) {
    hour24 = saved.hour;
    minute = saved.min;
    armed = saved.on;
  }
  from24();

  const root = screen();
  const sky = worldSky(root, 0);

  const clock = page(root, "clock");
  cloudRoom(clock, 0);
  const timeW = stripWidth("--:--", STRIP_GAP);
  const timeX = Math.floor((W - (timeW + 6 + 16)) / 2);
  const time = createStrip(clock, timeX, 40, "--:--");
  pulseColon(time.imgs[2]);
  const ampm = label(clock, "A\nM", {
    size: 16, color: PHOS_GOLD, letterSpace: 0, lineSpace: 2,
    x: timeX + timeW + 6, y: 40 + 64 - 34,
  });
  const actor = createKirbyActor(clock, 128, 132, true);
  stageStar(clock, 96, 168);
  stageStar(clock, 216, 168);
  roomPips(clock, 0);
  const dateLbl = label(clock, "---", { size: 8, color: PHOS_CREAM, x: 8, y: 8 });
  const armedLbl = label(clock, "", { size: 8, color: PHOS_GOLD, x: 8, y: 20 });
  label(clock, "^ ALARM", { size: 8, color: PHOS_PINK, right: 8, y: 8 });

  const alarm = page(root, "alarm");
  hidePage(alarm);
  const stw = 36 * 2 + 8;
  const stg = 24;
  const amw = 44;
  const amg = 10;
  const stx = Math.floor((W - stw - stg - stw - amg - amw) / 2);
  const amx = stx + stw + stg + stw + amg;
  label(alarm, "HOUR", { size: 8, color: PHOS_CREAM, letterSpace: 0, x: stx + Math.floor((stw - 32) / 2), y: 6 });
  label(alarm, "MIN", { size: 8, color: PHOS_CREAM, letterSpace: 0, x: stx + stw + stg + Math.floor((stw - 24) / 2), y: 6 });
  label(alarm, "AMPM", { size: 8, color: PHOS_CREAM, letterSpace: 0, x: amx + Math.floor((amw - 32) / 2), y: 26 + 24 + 16 - 16 });

  const hourState = { value: hour12, min: 1, max: 12, onChange: stepChanged };
  const minState = { value: minute, min: 0, max: 59, onChange: stepChanged };
  createStepper(alarm, stx, 26, hourState);
  createStepper(alarm, stx + stw + stg, 26, minState);

  const colon = document.createElement("img");
  colon.className = "kirby-spr";
  colon.src = "/assets/demos/companion/digit-colon.png";
  colon.width = 14;
  colon.height = 64;
  colon.style.left = `${stx + stw + Math.floor((stg - 14) / 2)}px`;
  colon.style.top = `${26 + 24 + 16}px`;
  alarm.appendChild(colon);
  pulseColon(colon);

  const ampmTile = document.createElement("button");
  ampmTile.type = "button";
  ampmTile.className = "kirby-ampm-tile";
  ampmTile.style.left = `${amx}px`;
  ampmTile.style.top = `${26 + 24 + 16}px`;
  const ampmSet = label(ampmTile, isPm ? "PM" : "AM", { size: 16, color: PHOS_GOLD, letterSpace: 0 });
  ampmTile.addEventListener("click", (e) => {
    e.stopPropagation();
    if (firing) return;
    isPm = !isPm;
    to24();
    ampmSet.setText(isPm ? "PM" : "AM");
    refreshArmed();
    savePrefs();
    playUiClick();
  });
  alarm.appendChild(ampmTile);

  let toggleBtn;
  toggleBtn = btn(alarm, "Off", 48, SHEET_BTN_Y, 224, STAGE_BTN_H, BTN_GRAY, () => {
    if (firing) return;
    armed = !armed;
    syncToggle();
    refreshArmed();
    savePrefs();
  });
  label(alarm, "v CLOCK", { size: 8, color: PHOS_PINK, right: 8, y: 8 });

  const alert = page(root, "alert");
  hidePage(alert);
  const alertTitle = label(alert, "ALARM", { size: 8, color: PHOS_GOLD, centerX: true, y: 8 });
  const alertW = stripWidth("00:00", STRIP_GAP);
  const alertX = Math.floor((W - (alertW + 6 + 16)) / 2);
  const alertTime = createStrip(alert, alertX, 48, "00:00");
  pulseColon(alertTime.imgs[2]);
  const alertAmpm = label(alert, "A\nM", {
    size: 16, color: PHOS_GOLD, letterSpace: 0, lineSpace: 2,
    x: alertX + alertW + 6, y: 48 + 64 - 34,
  });
  btn(alert, "Dismiss", 70, STAGE_BTN_Y, 180, 44, BTN_RED, stopFiring);

  function from24() {
    let h = hour24;
    if (h < 0) h = 0;
    if (h > 23) h = 23;
    isPm = h >= 12;
    h = h % 12;
    if (h === 0) h = 12;
    hour12 = h;
  }

  function to24() {
    hour24 = (hour12 % 12) + (isPm ? 12 : 0);
  }

  function stepChanged() {
    if (firing) return;
    hour12 = hourState.value;
    minute = minState.value;
    to24();
    refreshArmed();
    savePrefs();
  }

  function syncToggle() {
    toggleBtn.relabel(armed ? "Armed" : "Off");
    toggleBtn.recolor(armed ? BTN_GREEN : BTN_GRAY);
  }

  function refreshArmed() {
    if (!armed) {
      armedLbl.setText("");
      return;
    }
    armedLbl.setText(`${hour12}:${String(minute).padStart(2, "0")} ${isPm ? "PM" : "AM"}`);
  }

  function refreshAmpmSet() {
    ampmSet.setText(isPm ? "PM" : "AM");
  }

  function showView(next, slide) {
    if (next === view) {
      if (!slide) jumpPages({ hide: next === "clock" ? alarm : clock, show: next === "clock" ? clock : alarm, sky, upper: next === "alarm" });
      return;
    }
    if (busy || pageBusy(clock, alarm)) return;
    const from = view === "clock" ? clock : alarm;
    const to = next === "clock" ? clock : alarm;
    view = next;
    if (slide) {
      busy = true;
      slidePages({ from, to, sky, upper: next === "alarm", onBusy: (v) => { busy = v; } });
    } else {
      jumpPages({ hide: from, show: to, sky, upper: next === "alarm" });
    }
  }

  function stopFiring() {
    firing = false;
    stopPulse(alertTitle);
    hidePage(alert);
    jumpPages({
      hide: view === "clock" ? alarm : clock,
      show: view === "clock" ? clock : alarm,
      sky,
      upper: view === "alarm",
    });
    stopAlarmSong();
    syncToggle();
    refreshArmed();
  }

  function tick() {
    const now = new Date();
    const h = now.getHours();
    const h12 = h % 12 || 12;
    time.set(`${String(h12).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    ampm.setText(h >= 12 ? "P\nM" : "A\nM");
    dateLbl.setText(`${DAY[now.getDay()]} ${MON[now.getMonth()]} ${now.getDate()}`);

    const nowEnc = h * 60 + now.getMinutes();
    const almEnc = hour24 * 60 + minute;
    if (nowEnc !== almEnc) lastFired = -1;
    if (!armed || firing) return;
    if (nowEnc === almEnc && now.getSeconds() < 30 && lastFired !== nowEnc) {
      lastFired = nowEnc;
      firing = true;
      alertTime.set(`${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      alertAmpm.setText(isPm ? "P\nM" : "A\nM");
      hidePage(clock);
      hidePage(alarm);
      setSkyY(sky, 0);
      showPage(alert, 0);
      startAlarmSong();
      pulseLabel(alertTitle);
      onFired?.();
    }
  }

  function handleSwipe(g) {
    if (firing) return;
    if (busy || pageBusy(clock, alarm)) return;
    if (g === GESTURE_SLIDE_UP && view === "clock") {
      showView("alarm", true);
      playUiSwipe();
    } else if (g === GESTURE_SLIDE_DOWN && view === "alarm") {
      showView("clock", true);
      playUiSwipe();
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ hour: hour24, min: minute, on: armed }));
    } catch { /* ignore */ }
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

  syncToggle();
  refreshAmpmSet();
  refreshArmed();
  let tickId = setInterval(tick, 1000);
  tick();

  return {
    el: root,
    handleSwipe,
    hello: () => actor.hello(),
    isLowerView: () => view === "clock" && !firing && !busy,
    isFiring: () => firing,
    setOnFired(fn) { onFired = fn; },
    pause() {
      if (tickId == null) return;
      clearInterval(tickId);
      tickId = null;
    },
    resume() {
      if (tickId != null) return;
      tick();
      tickId = setInterval(tick, 1000);
    },
    destroy() {
      actor.destroy();
      pauseSafe();
    },
  };

  function pauseSafe() {
    if (tickId == null) return;
    clearInterval(tickId);
    tickId = null;
  }
}
