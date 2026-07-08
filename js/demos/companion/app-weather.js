import { el, label, centerLabel, stars, horizGradBg } from "./components/ui.js";
import { FONT_LARGE, FONT_MEDIUM, FONT_SMALL, KIRBY_TEXT, KIRBY_TEXT_SOFT, KIRBY_ACCENT_WARM, KIRBY_TEXT_DIM, BTN_PINK } from "./theme.js";
import { GESTURE_SLIDE_UP, GESTURE_SLIDE_DOWN } from "./theme.js";
import { playUiSwipe } from "./audio.js";

const MOCK = {
  city: "Detroit",
  temp: 68,
  tag: "Sunny",
  forecast: [
    { day: "Sat", cond: "Sunny", hi: 72, lo: 55 },
    { day: "Sun", cond: "Rainy", hi: 64, lo: 48 },
    { day: "Mon", cond: "Breezy", hi: 58, lo: 42 },
    { day: "Tue", cond: "Cloudy", hi: 61, lo: 45 },
  ],
};

export function createWeatherApp() {
  let view = "today";
  const screen = el("div", "kirby-screen");
  horizGradBg(screen, true);

  const todayCont = el("div", "kirby-subscreen");
  stars(todayCont);
  centerLabel(todayCont, MOCK.city, -58, { font: FONT_SMALL, color: BTN_PINK, w: 276, align: "center" });
  centerLabel(todayCont, `${MOCK.temp} F`, -14, { font: FONT_LARGE, color: KIRBY_TEXT });
  centerLabel(todayCont, MOCK.tag, 36, { font: FONT_MEDIUM, color: KIRBY_ACCENT_WARM });
  label(todayCont, "▲ Forecast", { font: FONT_SMALL, color: KIRBY_TEXT_DIM, center: true, bottom: 4 });

  const fcCont = el("div", "kirby-subscreen kirby-hidden");
  horizGradBg(fcCont, true);
  stars(fcCont);
  label(fcCont, "Forecast", { font: FONT_SMALL, color: BTN_PINK, center: true, y: 18 });

  const rowY = [40, 83, 126, 169];
  MOCK.forecast.forEach((row, i) => {
    label(fcCont, row.day, { font: FONT_SMALL, color: KIRBY_ACCENT_WARM, x: 22, y: rowY[i] + 12 });
    label(fcCont, row.cond, { font: FONT_SMALL, color: KIRBY_TEXT, x: 105, y: rowY[i] + 12, w: 110, align: "center" });
    label(fcCont, `${row.hi}/${row.lo}`, { font: FONT_SMALL, color: KIRBY_TEXT_SOFT, x: 228, y: rowY[i] + 12 });
    if (i < 3) {
      const sep = el("div", "kirby-sep");
      sep.style.top = `${rowY[i] + 40}px`;
      fcCont.appendChild(sep);
    }
  });
  label(fcCont, "▼ Today", { font: FONT_SMALL, color: KIRBY_TEXT_DIM, center: true, bottom: 4 });

  screen.append(todayCont, fcCont);

  function showView(v) {
    view = v;
    todayCont.classList.toggle("kirby-hidden", v !== "today");
    fcCont.classList.toggle("kirby-hidden", v !== "forecast");
  }

  function handleSwipe(g) {
    if (g === GESTURE_SLIDE_UP && view === "today") {
      playUiSwipe();
      showView("forecast");
    } else if (g === GESTURE_SLIDE_DOWN && view === "forecast") {
      playUiSwipe();
      showView("today");
    }
  }

  return { el: screen, handleSwipe };
}
