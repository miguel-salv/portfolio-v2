const birth = new Date(2005, 1, 20);
const yearMs = 365.25 * 24 * 60 * 60 * 1000;
let timer = 0;
let started = performance.now();
let liveAge = null;
let uptime = null;

function renderCounters() {
  if (liveAge) {
    const age = (Date.now() - birth.getTime()) / yearMs;
    liveAge.textContent = `AGE // ${age.toFixed(9)}`;
  }

  if (uptime) {
    const total = Math.floor((performance.now() - started) / 1000);
    const pad = (value) => String(value).padStart(2, "0");
    uptime.textContent = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  }
}

function startCounters() {
  if (!liveAge && !uptime) return;
  renderCounters();
  window.clearInterval(timer);
  timer = window.setInterval(renderCounters, 100);
}

function stopCounters() {
  window.clearInterval(timer);
  timer = 0;
}

function initCounters() {
  stopCounters();
  liveAge = document.querySelector("[data-live-age]");
  uptime = document.querySelector("[data-uptime]");
  started = performance.now();
  startCounters();
}

document.addEventListener("astro:page-load", initCounters);
document.addEventListener("astro:before-preparation", stopCounters);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCounters();
  else startCounters();
});
