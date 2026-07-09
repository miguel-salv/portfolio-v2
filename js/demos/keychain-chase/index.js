import { createLoop } from "../platform.js";

const LED_COUNT = 5;
const CLOCK_HZ = 10;
const LOOPS_BEFORE_SHUTOFF = 9;
const STEP_MS = 1000 / CLOCK_HZ;

export function mount(frame) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const root = document.createElement("div");
  root.className = "keychain-demo";
  frame.appendChild(root);

  const stage = document.createElement("div");
  stage.className = "keychain-stage";
  root.appendChild(stage);

  const stageLabel = document.createElement("div");
  stageLabel.className = "keychain-stage-label mono";
  stageLabel.textContent = "LED outputs";
  stage.appendChild(stageLabel);

  const ledRow = document.createElement("div");
  ledRow.className = "keychain-led-row";
  stage.appendChild(ledRow);

  const leds = [];
  for (let i = 0; i < LED_COUNT; i++) {
    const cell = document.createElement("div");
    cell.className = "keychain-led-cell";

    const lamp = document.createElement("span");
    lamp.className = "keychain-led";
    lamp.setAttribute("aria-hidden", "true");

    const tag = document.createElement("span");
    tag.className = "keychain-led-tag mono";
    tag.textContent = `Q${i}`;

    cell.appendChild(lamp);
    cell.appendChild(tag);
    ledRow.appendChild(cell);
    leds.push(lamp);
  }

  // Three ICs, labeled by job + live readout so the highlight is readable.
  const path = document.createElement("div");
  path.className = "keychain-path";
  path.setAttribute("aria-label", "Signal path from clock to LED sequencer to loop counter");
  root.appendChild(path);

  const chips = [
    {
      id: "555",
      role: "Clock",
      part: "LMC555",
      idle: "off",
      explain: "Astable timer. Pulses ~10 times per second to step the chase.",
    },
    {
      id: "4017a",
      role: "LED sequencer",
      part: "CD4017",
      idle: "—",
      explain: "Decade counter. Each clock pulse lights the next LED (Q0→Q4).",
    },
    {
      id: "4017b",
      role: "Loop counter",
      part: "CD4017",
      idle: "0 / 9",
      explain: "Counts full chase loops. After 9, it latches power off.",
    },
  ];
  const chipNodes = {};
  const chipLive = {};

  chips.forEach((chip, index) => {
    if (index > 0) {
      const arrow = document.createElement("span");
      arrow.className = "keychain-path-arrow mono";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      path.appendChild(arrow);
    }

    const node = document.createElement("div");
    node.className = "keychain-chip";
    node.dataset.id = chip.id;
    node.title = chip.explain;

    const role = document.createElement("span");
    role.className = "keychain-chip-role";
    role.textContent = chip.role;

    const part = document.createElement("span");
    part.className = "keychain-chip-part mono";
    part.textContent = chip.part;

    const live = document.createElement("span");
    live.className = "keychain-chip-live mono";
    live.textContent = chip.idle;

    node.appendChild(role);
    node.appendChild(part);
    node.appendChild(live);
    path.appendChild(node);

    chipNodes[chip.id] = node;
    chipLive[chip.id] = live;
  });

  const controls = document.createElement("div");
  controls.className = "keychain-controls";
  root.appendChild(controls);

  const meta = document.createElement("div");
  meta.className = "keychain-meta";
  controls.appendChild(meta);

  const status = document.createElement("span");
  status.className = "keychain-status mono";
  status.setAttribute("aria-live", "polite");
  meta.appendChild(status);

  const loopMeter = document.createElement("div");
  loopMeter.className = "keychain-loop-meter";
  loopMeter.setAttribute("aria-hidden", "true");
  meta.appendChild(loopMeter);

  const loopTicks = [];
  for (let i = 0; i < LOOPS_BEFORE_SHUTOFF; i++) {
    const tick = document.createElement("span");
    tick.className = "keychain-loop-tick";
    loopMeter.appendChild(tick);
    loopTicks.push(tick);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "keychain-press";
  button.textContent = "Start";
  button.setAttribute("aria-label", "Start LED chase");
  controls.appendChild(button);

  let running = false;
  let ledIndex = 0;
  let loopCount = 0;
  let stepAcc = 0;
  let clockHigh = false;
  let flash4017a = false;
  let flash4017b = false;
  let flashTimer = 0;

  function setStatus(text) {
    status.textContent = text;
  }

  function paint() {
    leds.forEach((led, i) => {
      led.classList.toggle("is-on", running && i === ledIndex);
    });
    loopTicks.forEach((tick, i) => {
      tick.classList.toggle("is-on", i < loopCount);
    });

    // Clock: pulse readout tracks the 555 output edge.
    if (!running) {
      chipLive["555"].textContent = "off";
      chipLive["4017a"].textContent = "—";
      chipLive["4017b"].textContent = `0 / ${LOOPS_BEFORE_SHUTOFF}`;
    } else {
      chipLive["555"].textContent = clockHigh ? "tick ↑" : "tick ↓";
      chipLive["4017a"].textContent = `lights Q${ledIndex}`;
      chipLive["4017b"].textContent = `${loopCount} / ${LOOPS_BEFORE_SHUTOFF}`;
    }

    chipNodes["555"].classList.toggle("is-active", running && clockHigh);
    chipNodes["4017a"].classList.toggle("is-active", running && flash4017a);
    chipNodes["4017b"].classList.toggle("is-active", running && flash4017b);
    chipNodes["555"].classList.toggle("is-armed", running);
    chipNodes["4017a"].classList.toggle("is-armed", running);
    chipNodes["4017b"].classList.toggle("is-armed", running);

    button.disabled = running;
    button.setAttribute("aria-disabled", String(running));
    button.textContent = running ? "Running" : "Start";
  }

  function resetIdle() {
    running = false;
    ledIndex = 0;
    loopCount = 0;
    stepAcc = 0;
    clockHigh = false;
    flash4017a = false;
    flash4017b = false;
    setStatus("Idle");
    paint();
  }

  function startChase() {
    if (running) return;
    running = true;
    ledIndex = 0;
    loopCount = 1;
    stepAcc = 0;
    clockHigh = true;
    flash4017a = true;
    flash4017b = false;
    setStatus(`Loop 1 of ${LOOPS_BEFORE_SHUTOFF}`);
    paint();

    if (reducedMotion) {
      loopCount = LOOPS_BEFORE_SHUTOFF;
      running = false;
      clockHigh = false;
      ledIndex = 0;
      flash4017a = false;
      flash4017b = false;
      setStatus("Done");
      paint();
      return;
    }
    animLoop.start();
  }

  function tick(dt) {
    if (!running) return;
    stepAcc += dt;
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) {
        flash4017a = false;
        flash4017b = false;
        paint();
      }
    }

    while (stepAcc >= STEP_MS) {
      stepAcc -= STEP_MS;
      clockHigh = !clockHigh;

      // Advance LEDs on the rising edge (555 → sequencer).
      if (clockHigh) {
        ledIndex = (ledIndex + 1) % LED_COUNT;
        flash4017a = true;
        flashTimer = 80;

        if (ledIndex === 0) {
          flash4017b = true;
          flashTimer = 140;
          if (loopCount >= LOOPS_BEFORE_SHUTOFF) {
            running = false;
            clockHigh = false;
            ledIndex = 0;
            flash4017a = false;
            flash4017b = false;
            setStatus("Done");
            paint();
            animLoop.stop();
            return;
          }
          loopCount += 1;
          setStatus(`Loop ${loopCount} of ${LOOPS_BEFORE_SHUTOFF}`);
        }
      }
      paint();
    }
  }

  const animLoop = createLoop(tick, { fixedStep: 1000 / 60 });

  button.addEventListener("click", startChase);
  frame.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startChase();
    }
  });

  resetIdle();

  return {
    pause() {
      if (!reducedMotion) animLoop.stop();
    },
    resume() {
      if (!reducedMotion && running) animLoop.start();
    },
  };
}
