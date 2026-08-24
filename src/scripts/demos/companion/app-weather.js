import { cloudRoom, goldSep, label, page, roomPips, screen, spr, stageStar, worldSky } from "./components/ui.js";
import { createStrip, stripWidth } from "./phos-strip.js";
import { cancelAnim, hidePage, pageBusy, pingPong, slidePages } from "./motion.js";
import { playUiSwipe } from "./audio.js";
import {
  GESTURE_SLIDE_DOWN, GESTURE_SLIDE_UP, PHOS_CREAM, PHOS_GOLD, PHOS_PINK,
  STRIP_GAP, W, asset, easeInOutSine, prefersReducedMotion,
} from "./theme.js";

const MOCK = {
  city: "Royal Oak",
  temp: 72,
  tag: "SUNNY",
  icon: "wx-sun32.png",
  forecast: [
    { day: "Sat", cond: "SUNNY", icon: "wx-sun.png", hi: 74, lo: 55 },
    { day: "Sun", cond: "BREEZY", icon: "wx-wind.png", hi: 68, lo: 50 },
    { day: "Mon", cond: "RAINY", icon: "wx-rain.png", hi: 61, lo: 48 },
    { day: "Tue", cond: "SNOWY", icon: "wx-snow.png", hi: 52, lo: 36 },
  ],
};

const ICON32 = {
  SUNNY: "wx-sun32.png",
  RAINY: "wx-rain32.png",
  BREEZY: "wx-wind32.png",
  SNOWY: "wx-snow32.png",
  CLOUDY: "wx-cloud32.png",
};

export function createWeatherApp() {
  let view = "today";
  let busy = false;
  const root = screen();
  const sky = worldSky(root, 1);

  const today = page(root, "today");
  cloudRoom(today, 1);
  stageStar(today, 96, 168);
  roomPips(today, 1);

  label(today, MOCK.city, { size: 8, color: PHOS_CREAM, x: 8, y: 8, w: 196 });

  const init = "00";
  const sw = stripWidth(init, STRIP_GAP);
  const total = sw + 8 + 16;
  const tx = Math.floor((W - total) / 2);
  const temp = createStrip(today, tx, 56, init);
  temp.set(String(MOCK.temp).padStart(2, "0"));
  const minus = label(today, "-", { size: 16, color: PHOS_GOLD, letterSpace: 0, x: tx - 12, y: 78 });
  minus.classList.add("kirby-hidden");
  label(today, "F", { size: 16, color: PHOS_GOLD, letterSpace: 0, x: tx + sw + 4, y: 60 });

  const icon = spr(MOCK.icon, 0, 124, 32, 32);
  today.appendChild(icon);
  const tag = label(today, MOCK.tag, { size: 16, color: PHOS_CREAM, letterSpace: 0, x: 0, y: 132 });
  layoutCaption(MOCK.tag);
  const iconBobKey = "wx-icon-bob";
  if (!prefersReducedMotion()) {
    pingPong({
      key: iconBobKey,
      from: 124,
      to: 121,
      ms: 700,
      ease: easeInOutSine,
      onUpdate: (v) => { icon.style.top = `${v}px`; },
    });
  }

  label(today, "^ FORECAST", { size: 8, color: PHOS_PINK, right: 8, y: 8 });

  const forecast = page(root, "forecast");
  hidePage(forecast);
  const rowY = [32, 80, 128, 176];
  MOCK.forecast.forEach((row, i) => {
    const y = rowY[i];
    label(forecast, row.day, { size: 8, color: PHOS_CREAM, letterSpace: 0, x: 16, y: y + 8 });
    const ic = spr(row.icon, 64, y + 6, 16, 16);
    forecast.appendChild(ic);
    label(forecast, row.cond, { size: 8, color: PHOS_CREAM, letterSpace: 0, x: 88, y: y + 8, w: 110 });
    label(forecast, String(row.hi), { size: 16, color: PHOS_GOLD, letterSpace: 0, align: "right", w: 48, x: 248, y: y + 2 });
    label(forecast, String(row.lo), { size: 8, color: PHOS_CREAM, letterSpace: 0, align: "right", w: 48, x: 248, y: y + 18 });
    if (i < 3) goldSep(forecast, y + 28);
  });
  label(forecast, "v TODAY", { size: 8, color: PHOS_PINK, right: 8, y: 8 });

  function layoutCaption(text) {
    const tw = text.length * 16;
    const x = Math.floor((W - (32 + 8 + tw)) / 2);
    icon.style.left = `${x}px`;
    icon.src = asset(ICON32[text] || "wx-cloud32.png");
    tag.setText(text);
    tag.style.left = `${x + 40}px`;
  }

  function showView(next) {
    if (next === view || busy || pageBusy(today, forecast)) return;
    const from = view === "today" ? today : forecast;
    const to = next === "today" ? today : forecast;
    view = next;
    if (next === "today") {
      if (!prefersReducedMotion()) {
        pingPong({
          key: iconBobKey,
          from: 124,
          to: 121,
          ms: 700,
          ease: easeInOutSine,
          onUpdate: (v) => { icon.style.top = `${v}px`; },
        });
      }
    } else {
      cancelAnim(iconBobKey);
      icon.style.top = "124px";
    }
    busy = true;
    slidePages({ from, to, sky, upper: next === "forecast", onBusy: (v) => { busy = v; } });
  }

  function handleSwipe(g) {
    if (busy || pageBusy(today, forecast)) return;
    if (g === GESTURE_SLIDE_UP && view === "today") {
      showView("forecast");
      playUiSwipe();
    } else if (g === GESTURE_SLIDE_DOWN && view === "forecast") {
      showView("today");
      playUiSwipe();
    }
  }

  return {
    el: root,
    handleSwipe,
    isLowerView: () => view === "today" && !busy,
  };
}
