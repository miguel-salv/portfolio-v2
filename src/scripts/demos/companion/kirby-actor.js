import { spr } from "./components/ui.js";
import { playKirbyHop } from "./audio.js";
import { asset, easeInCubic, easeInOutSine, easeOutCubic, prefersReducedMotion } from "./theme.js";
import { cancelAnim, pingPong, tween } from "./motion.js";

let rng = 0xA5A5;

function rnd() {
  rng = (rng * 1664525 + 1013904223) >>> 0;
  return rng;
}

function pose(img, name) {
  img.src = asset(`kirby-${name}.png`);
}

export function createKirbyActor(parent, x, y, bob) {
  const img = spr("kirby-idle.png", x, y, 64, 64);
  img.classList.add("kirby-actor");
  img.alt = "Kirby";
  parent.appendChild(img);

  const timers = new Set();
  let busy = false;
  let helloQueued = false;
  let hopPhase = 0;
  const restY = y;
  const reduced = prefersReducedMotion();
  const bobKey = `kirby-bob-${x}`;
  const hopKey = `kirby-hop-${x}`;

  function later(fn, ms) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function startBob() {
    if (!bob || reduced) {
      img.style.top = `${restY}px`;
      return;
    }
    pingPong({
      key: bobKey,
      from: restY,
      to: restY - 6,
      ms: 640,
      ease: easeInOutSine,
      onUpdate: (v) => { img.style.top = `${v}px`; },
    });
  }

  function hopAnim(y0, y1, ms, ease, done, playback = 0) {
    tween({
      key: hopKey,
      from: y0,
      to: y1,
      ms,
      ease,
      onUpdate: (v) => { img.style.top = `${v}px`; },
      onDone() {
        if (!playback) {
          done?.();
          return;
        }
        tween({
          key: hopKey,
          from: y1,
          to: y0,
          ms: playback,
          ease,
          onUpdate: (v) => { img.style.top = `${v}px`; },
          onDone: done,
        });
      },
    });
  }

  function hopNext() {
    hopPhase += 1;
    if (hopPhase === 1) {
      pose(img, "idle");
      hopAnim(restY + 3, restY - 16, 110, easeOutCubic, hopNext);
    } else if (hopPhase === 2) {
      pose(img, "squash");
      hopAnim(restY - 16, restY, 130, easeInCubic, hopNext);
    } else {
      pose(img, "idle");
      hopAnim(restY, restY - 6, 70, easeOutCubic, () => {
        pose(img, "idle");
        startBob();
        busy = false;
        hopPhase = 0;
      }, 80);
    }
  }

  function tapHop() {
    if (busy || !bob) return;
    busy = true;
    hopPhase = 0;
    pose(img, "squash");
    cancelAnim(bobKey);
    cancelAnim(hopKey);
    playKirbyHop();
    hopAnim(restY, restY + 3, 75, easeInCubic, hopNext);
  }

  function startWave() {
    busy = true;
    helloQueued = false;
    let left = 6;
    let flip = false;
    pose(img, "wave");
    const tick = () => {
      flip = !flip;
      pose(img, flip ? "wave2" : "wave");
      left -= 1;
      if (left <= 0) {
        pose(img, "idle");
        busy = false;
        return;
      }
      later(tick, 120);
    };
    later(tick, 120);
  }

  function hello() {
    if (!bob) return;
    if (busy) {
      helloQueued = true;
      return;
    }
    startWave();
  }

  if (bob) {
    img.classList.add("kirby-actor--live");
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-label", "Kirby, tap to hop");
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      tapHop();
    });
    img.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tapHop();
      }
    });
    startBob();
    if (!reduced) {
      const blink = () => {
        if (busy) {
          later(blink, 2000 + (rnd() % 2201));
          return;
        }
        pose(img, "blink");
        if ((rnd() & 3) === 0) {
          later(() => {
            if (busy) return;
            pose(img, "idle");
            later(() => {
              if (busy) return;
              pose(img, "blink");
              later(() => { if (!busy) pose(img, "idle"); }, 140);
            }, 80);
          }, 140);
        } else {
          later(() => { if (!busy) pose(img, "idle"); }, 140);
        }
        later(blink, 2000 + (rnd() % 2201));
      };
      later(blink, 2000 + (rnd() % 2201));

      const poseTick = () => {
        if (busy) {
          later(poseTick, 12000 + (rnd() % 10001));
          return;
        }
        if (helloQueued) {
          startWave();
          later(poseTick, 12000 + (rnd() % 10001));
          return;
        }
        busy = true;
        if ((rnd() & 1) === 0) startWave();
        else {
          pose(img, "inhale");
          later(() => {
            pose(img, "idle");
            busy = false;
          }, 900);
        }
        later(poseTick, 12000 + (rnd() % 10001));
      };
      later(poseTick, 12000 + (rnd() % 10001));
    }
  } else if (!reduced) {
    const blink = () => {
      pose(img, "blink");
      later(() => pose(img, "idle"), 140);
      later(blink, 2600);
    };
    later(blink, 2600);
  }

  function catchHop() {
    cancelAnim(hopKey);
    hopAnim(restY, restY - 8, 90, easeOutCubic, () => {
      hopAnim(restY - 8, restY, 90, easeOutCubic);
    });
  }

  function setX(nx) {
    img.style.left = `${nx}px`;
  }

  function destroy() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    cancelAnim(bobKey);
    cancelAnim(hopKey);
  }

  return { el: img, hello, catchHop, setX, destroy, restY };
}
