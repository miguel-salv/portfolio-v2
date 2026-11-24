// Front always has A, rear always has B, and the Pi stays on both.
export function signalRoute(frontB, rearA) {
  if (rearA) return "a";
  return frontB ? "b" : "bridge";
}

const LINK_STEPS = {
  connected: { message: "Both buses connected", instruction: "Pull either jumper while the lamps blink." },
  a: { message: "CAN A still carries the signal", instruction: "Pull Rear A to break the direct path." },
  b: { message: "CAN B still carries the signal", instruction: "Pull Front B to break the direct path." },
  bridge: { message: "CAN A → Raspberry Pi → CAN B", instruction: "The Pi relays the clock references. The lamps stay in sync." },
};

const COCKPIT_STATES = {
  leading: {
    rate: 2, piRole: "Leader", message: "The Pi is leading.", instruction: "The left signal runs at 2 Hz.",
    button: "Stop cockpit", next: "stopped",
  },
  stopped: {
    rate: 4, piRole: "Offline", message: "The front STM32 took over.", instruction: "Both lamps switched to 4 Hz hazards.",
    button: "Restart cockpit", next: "rejoined",
  },
  rejoined: {
    rate: 0, piRole: "Follower", message: "The Pi rejoined as a follower.", instruction: "The hazards cleared and the lamps went dark.",
    button: "Run again", next: "leading",
  },
};

function jumper(link, label) {
  return `
    <button type="button" class="can-jumper can-jumper--${link}" data-link="${link}" data-label="${label}">
      <svg class="can-jumper-symbol" viewBox="0 0 24 24" aria-hidden="true">
        <path class="can-jumper-closed" d="M12 6V18" />
        <path class="can-jumper-open" d="M12 18l6-10" />
        <circle cx="12" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
      </svg>
      <span>Pull ${label}</span>
    </button>`;
}

export function mount(frame) {
  const bench = document.createElement("div");
  bench.className = "can-bench";
  bench.innerHTML = `
    <div class="can-toolbar">
      <div class="can-test-picker rtos-stepper" role="group" aria-label="Bench test">
        <button type="button" data-test="links" aria-pressed="true">Pull two links</button>
        <button type="button" data-test="cockpit" aria-pressed="false">Cockpit outage</button>
      </div>
      <button type="button" class="can-motion-control" aria-label="Pause blinking" title="Pause blinking">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path class="can-pause-icon" d="M7 5v10m6-10v10"/><path class="can-play-icon" d="m7 5 7 5-7 5Z"/></svg>
      </button>
    </div>
    <div class="can-guide">
      <div class="can-guide-copy" role="status">
        <span data-test-status=""></span>
        <span data-test-instruction=""></span>
      </div>
      <button type="button" class="can-cockpit-control rtos-stepper" hidden>Stop cockpit</button>
    </div>
    <div class="can-wiring">
      <svg class="can-bench-diagram" viewBox="0 0 600 308" aria-hidden="true">
        <text class="can-rail-label" x="42" y="32">CAN A</text>
        <text class="can-rail-label" x="42" y="288">CAN B</text>
        <path class="can-wire" d="M42 46H558 M42 262H558 M117 46V110 M483 46V74 M483 82V110 M117 198V226 M117 234V262 M483 198V262" />
        <path class="can-wire can-pi-links" d="M300 46V110 M300 198V262" />
        <path class="can-wire can-fixed-links" d="M483 74V82 M117 226V234" />
        <path class="can-route can-route--a" d="M117 110V46H483V110" />
        <path class="can-route can-route--b" d="M117 198V262H483V198" />
        <path class="can-route can-route--bridge" d="M117 110V46H300V110 M300 198V262H483V198" />
        <path class="can-route can-route--pi" d="M117 110V46H483V110 M300 46V110" />
        <circle class="can-pulse" r="7" />
        <rect class="can-node can-node--front" x="42" y="110" width="150" height="88" rx="3" />
        <rect class="can-node can-node--pi" x="225" y="110" width="150" height="88" rx="3" />
        <rect class="can-node" x="408" y="110" width="150" height="88" rx="3" />
        <circle class="can-lamp" cx="117" cy="131" r="6" />
        <circle class="can-lamp" cx="483" cy="131" r="6" />
        <g class="can-node-name" text-anchor="middle">
          <text x="117" y="159"><tspan class="can-node-full">Front STM32</tspan><tspan class="can-node-short">Front</tspan></text>
          <text x="300" y="159"><tspan class="can-node-full">Raspberry Pi</tspan><tspan class="can-node-short">Pi</tspan></text>
          <text x="483" y="159"><tspan class="can-node-full">Rear STM32</tspan><tspan class="can-node-short">Rear</tspan></text>
        </g>
        <g class="can-node-role" text-anchor="middle">
          <text x="117" y="181" data-front-role="">Leader</text>
          <text x="300" y="181" data-pi-role="">Cockpit</text>
          <text x="483" y="181">Drivetrain</text>
        </g>
      </svg>
      ${jumper("front", "Front B")}
      ${jumper("rear", "Rear A")}
    </div>
  `;
  const captures = frame.ownerDocument.getElementById("drive-by-wire-captures");
  const linkCapture = captures?.querySelector("#scope-capture");
  const cockpitCaptures = captures?.querySelectorAll("[data-cockpit-capture]") ?? [];
  const captureAnchor = frame.ownerDocument.createComment("Bench scope captures");
  if (captures) {
    captures.before(captureAnchor);
    bench.appendChild(captures);
  }
  frame.appendChild(bench);

  const controller = new AbortController();
  const listener = { signal: controller.signal };
  const cockpitButton = bench.querySelector(".can-cockpit-control");
  const motionButton = bench.querySelector(".can-motion-control");
  const tests = bench.querySelectorAll("[data-test]");
  const front = bench.querySelector('[data-link="front"]');
  const rear = bench.querySelector('[data-link="rear"]');
  const status = bench.querySelector("[data-test-status]");
  const instruction = bench.querySelector("[data-test-instruction]");
  const frontRole = bench.querySelector("[data-front-role]");
  const piRole = bench.querySelector("[data-pi-role]");
  let mode = "links";
  let frontB = true;
  let rearA = true;
  let cockpit = "leading";
  let lampsPaused = false;

  function renderJumper(button, connected, visible) {
    button.querySelector("span").textContent = `${connected ? "Pull" : "Reconnect"} ${button.dataset.label}`;
    button.toggleAttribute("data-open", !connected);
    button.hidden = !visible;
  }

  function render() {
    const links = mode === "links";
    const piLeads = !links && cockpit === "leading";
    const route = links ? signalRoute(frontB, rearA) : piLeads ? "pi" : "a";
    const relayStarted = route === "bridge" && bench.dataset.route !== "bridge";
    const cockpitState = COCKPIT_STATES[cockpit];
    const step = links ? LINK_STEPS[frontB && rearA ? "connected" : route] : cockpitState;
    const rate = links ? 2 : cockpitState.rate;

    bench.dataset.mode = mode;
    bench.dataset.cockpit = cockpit;
    bench.dataset.leader = piLeads ? "pi" : "front";
    bench.dataset.route = route;
    bench.dataset.lamps = rate === 4 ? "hazard" : rate ? "signal" : "off";
    for (const test of tests) test.setAttribute("aria-pressed", String(test.dataset.test === mode));
    renderJumper(front, frontB, links);
    renderJumper(rear, rearA, links);
    motionButton.hidden = !rate;
    cockpitButton.hidden = links;
    cockpitButton.textContent = cockpitState.button;
    frontRole.textContent = piLeads ? "Follower" : "Leader";
    piRole.textContent = links ? (route === "bridge" ? "Relay" : "Cockpit") : cockpitState.piRole;
    status.textContent = step.message;
    instruction.textContent = step.instruction;
    if (captures) captures.hidden = piLeads;
    if (linkCapture) {
      linkCapture.hidden = !links;
      if (relayStarted) linkCapture.open = true;
    }
    for (const photo of cockpitCaptures) photo.hidden = links || photo.dataset.cockpitCapture !== cockpit;
  }

  for (const test of tests) {
    test.addEventListener("click", () => {
      if (test.dataset.test === mode) return;
      mode = test.dataset.test;
      frontB = rearA = true;
      cockpit = "leading";
      if (linkCapture) linkCapture.open = false;
      render();
    }, listener);
  }
  motionButton.addEventListener("click", () => {
    lampsPaused = !lampsPaused;
    bench.dataset.lampsPaused = String(lampsPaused);
    const label = lampsPaused ? "Resume blinking" : "Pause blinking";
    motionButton.setAttribute("aria-label", label);
    motionButton.title = label;
  }, listener);
  for (const jumper of [front, rear]) {
    jumper.addEventListener("click", () => {
      if (jumper === front) frontB = !frontB;
      else rearA = !rearA;

      render();
    }, listener);
  }
  cockpitButton.addEventListener("click", () => {
    cockpit = COCKPIT_STATES[cockpit].next;
    render();
  }, listener);
  render();

  return {
    pause() { bench.dataset.paused = "true"; },
    resume() { delete bench.dataset.paused; },
    destroy() {
      controller.abort();
      if (captures) {
        captures.hidden = false;
        if (linkCapture) linkCapture.hidden = false;
        for (const photo of cockpitCaptures) photo.hidden = true;
        captureAnchor.replaceWith(captures);
      }
      bench.remove();
    },
  };
}
