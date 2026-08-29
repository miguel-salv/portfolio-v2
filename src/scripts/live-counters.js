let timer = 0;
let started = performance.now();
let uptime = null;

function renderCounters() {
  if (!uptime) return;
  const total = Math.floor((performance.now() - started) / 1000);
  const pad = (value) => String(value).padStart(2, "0");
  uptime.textContent = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function startCounters() {
  if (!uptime) return;
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
