const liveAge = document.querySelector("[data-live-age]");
const uptime = document.querySelector("[data-uptime]");
const birth = new Date(2005, 1, 20);
const yearMs = 365.25 * 24 * 60 * 60 * 1000;
const started = performance.now();
let timer = 0;

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
  renderCounters();
  window.clearInterval(timer);
  timer = window.setInterval(renderCounters, 100);
}

function stopCounters() {
  window.clearInterval(timer);
  timer = 0;
}

startCounters();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCounters();
  else startCounters();
});
