const PREFS_KEY = "kirby-demo-audio";

const ALARM_NOTES_HZ = [
  1046, 783, 622, 587, 523, 523, 587, 622, 523, 466, 523, 391,
  1046, 783, 622, 587, 523, 523, 587, 622, 698, 587, 466, 523, 391, 523,
];
const ALARM_NOTES_MS = [
  500, 500, 250, 250, 500, 250, 250, 250, 250, 250, 250, 500,
  500, 500, 250, 250, 250, 125, 125, 250, 250, 250, 250, 250, 250, 500,
];

let ctx = null;
let muted = loadMuted();
let alarmActive = false;
let alarmNoteIdx = 0;

function loadMuted() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function saveMuted() {
  try {
    localStorage.setItem(PREFS_KEY, muted ? "1" : "0");
  } catch { /* ignore */ }
}

async function ensureContext() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

function gainForVolume(volume) {
  return Math.min(0.18, (volume / 6) * 0.12);
}

async function playTone(freqHz, durMs, volume) {
  if (muted || !durMs || !freqHz || !volume) return;
  const audio = await ensureContext();

  const start = audio.currentTime;
  const dur = durMs / 1000;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = "sine";
  osc.frequency.value = freqHz;

  const peak = gainForVolume(volume);
  const attack = Math.min(0.004, dur * 0.15);
  const release = Math.min(0.005, dur * 0.2);

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setValueAtTime(peak, start + Math.max(attack, dur - release));
  gain.gain.linearRampToValueAtTime(0, start + dur);

  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + dur + 0.01);

  await new Promise((resolve) => window.setTimeout(resolve, durMs));
}

async function playTones(tones) {
  if (muted) return;
  for (const [hz, ms, vol] of tones) {
    if (muted) break;
    await playTone(hz, ms, vol);
  }
}

function scheduleAlarmNote() {
  if (!alarmActive || muted) return;
  const hz = ALARM_NOTES_HZ[alarmNoteIdx];
  const ms = ALARM_NOTES_MS[alarmNoteIdx];
  playTone(hz, ms, 4).then(() => {
    if (!alarmActive || muted) return;
    alarmNoteIdx = (alarmNoteIdx + 1) % ALARM_NOTES_HZ.length;
    scheduleAlarmNote();
  });
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  saveMuted();
  if (muted) stopAlarmSong();
}

export async function toggleMuted() {
  muted = !muted;
  saveMuted();
  if (muted) {
    stopAlarmSong();
    return muted;
  }
  await ensureContext();
  await playUiClick();
  return muted;
}

export function playUiClick() {
  return playTones([[784, 16, 6], [988, 20, 5]]);
}

export function playUiSwipe() {
  return playTones([[1175, 10, 5], [988, 12, 4], [784, 16, 3]]);
}

export function playUiChange() {
  return playTones([[659, 14, 5], [880, 18, 4]]);
}

export function startAlarmSong() {
  if (muted || alarmActive) return;
  alarmActive = true;
  alarmNoteIdx = 0;
  scheduleAlarmNote();
}

export function stopAlarmSong() {
  alarmActive = false;
}

export function playCatchSound() {
  return playTones([[988, 40, 6], [1318, 50, 5]]);
}

export function playMissSound() {
  return playTones([[330, 80, 5]]);
}

export function playGameOverSound() {
  return playTones([[523, 120, 5], [392, 120, 5], [330, 200, 5]]);
}

export function mountMuteToggle(frame) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "kirby-mute-toggle";

  const iconOn = `<svg class="kirby-mute-icon kirby-mute-icon--on" aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const iconOff = `<svg class="kirby-mute-icon kirby-mute-icon--off" aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m16 9 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  btn.innerHTML = `${iconOn}${iconOff}<span class="kirby-mute-label">Sound</span>`;

  function sync() {
    const on = !muted;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Mute demo sounds" : "Unmute demo sounds");
    btn.title = on ? "Sound on" : "Sound off";
  }

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await toggleMuted();
    sync();
  });

  sync();
  frame.appendChild(btn);
  return btn;
}
