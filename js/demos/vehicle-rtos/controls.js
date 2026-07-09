const FIELD_LIMITS = {
  c: { min: 5, max: 300, step: 5 },
  t: { min: 50, max: 2000, step: 10 },
};

function makeStepper(label, value, limits, onCommit) {
  const wrap = document.createElement("div");
  wrap.className = "rtos-stepper";

  const dec = document.createElement("button");
  dec.type = "button";
  dec.className = "rtos-stepper-btn";
  dec.textContent = "\u2212";
  dec.setAttribute("aria-label", `Decrease ${label}`);

  const input = document.createElement("input");
  input.type = "number";
  input.className = "rtos-stepper-input";
  input.min = String(limits.min);
  input.max = String(limits.max);
  input.step = String(limits.step);
  input.value = String(value);
  input.setAttribute("aria-label", label);

  const inc = document.createElement("button");
  inc.type = "button";
  inc.className = "rtos-stepper-btn";
  inc.textContent = "+";
  inc.setAttribute("aria-label", `Increase ${label}`);

  const clamp = (v) => Math.min(limits.max, Math.max(limits.min, v));

  function syncDisabled(clamped) {
    dec.disabled = clamped <= limits.min;
    inc.disabled = clamped >= limits.max;
  }

  function commit(v) {
    const clamped = clamp(Math.round(v / limits.step) * limits.step);
    input.value = String(clamped);
    syncDisabled(clamped);
    onCommit(clamped);
  }

  dec.addEventListener("click", () => commit(Number(input.value) - limits.step));
  inc.addEventListener("click", () => commit(Number(input.value) + limits.step));
  input.addEventListener("change", () => commit(Number(input.value)));

  wrap.appendChild(dec);
  wrap.appendChild(input);
  wrap.appendChild(inc);

  syncDisabled(value);

  return wrap;
}

function labeledField(label, el) {
  const wrap = document.createElement("div");
  wrap.className = "rtos-field";
  const span = document.createElement("span");
  span.className = "rtos-field-label mono";
  span.textContent = label;
  wrap.appendChild(span);
  wrap.appendChild(el);
  return wrap;
}

export function createControls(tasks, { onChange }) {
  const root = document.createElement("div");
  root.className = "rtos-controls";

  const rows = document.createElement("div");
  rows.className = "rtos-rows";
  root.appendChild(rows);

  tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "rtos-row";
    row.style.setProperty("--rtos-row-color", `var(--rtos-${task.id})`);

    const name = document.createElement("span");
    name.className = "rtos-row-name mono";
    const swatch = document.createElement("span");
    swatch.className = "rtos-row-swatch";
    swatch.setAttribute("aria-hidden", "true");
    name.appendChild(swatch);
    name.appendChild(document.createTextNode(task.name));
    row.appendChild(name);

    const cField = makeStepper(`${task.name} compute time`, task.c, FIELD_LIMITS.c, (v) => onChange(task.id, "c", v));
    const tField = makeStepper(`${task.name} period`, task.t, FIELD_LIMITS.t, (v) => onChange(task.id, "t", v));

    row.appendChild(labeledField("C", cField));
    row.appendChild(labeledField("T", tField));
    rows.appendChild(row);
  });

  const stats = document.createElement("div");
  stats.className = "rtos-stats mono";
  const uEl = document.createElement("span");
  const boundEl = document.createElement("span");
  const stateEl = document.createElement("span");
  stateEl.className = "rtos-state";
  stats.appendChild(uEl);
  stats.appendChild(boundEl);
  stats.appendChild(stateEl);
  root.appendChild(stats);

  return {
    el: root,
    updateStats(snapshot) {
      uEl.textContent = `U ${snapshot.utilization.toFixed(3)}`;
      boundEl.textContent = `UB(${snapshot.tasks.length}) ${snapshot.ubBound.toFixed(3)}`;
      stateEl.textContent = snapshot.schedulable ? "Schedulable" : "Deadline risk";
      stateEl.classList.toggle("is-bad", !snapshot.schedulable);
    },
  };
}
