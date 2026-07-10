// Fixed-priority preemptive scheduler simulation (rate-monotonic).
// From-scratch model of RMS concepts for a portfolio demo, not a port of coursework.

export const IDLE_ID = "idle";

export function computeUtilization(tasks) {
  return tasks.reduce((sum, t) => sum + t.c / t.t, 0);
}

export function computeUBBound(n) {
  return n * (Math.pow(2, 1 / n) - 1);
}

export function isSchedulable(tasks) {
  return computeUtilization(tasks) <= computeUBBound(tasks.length);
}

export function priorityOrder(tasks) {
  // Rate-monotonic: shorter period -> higher priority
  return [...tasks].sort((a, b) => a.t - b.t);
}

const HISTORY_MS = 8000;

export function createScheduler(taskDefs) {
  const tasks = taskDefs.map((t) => ({ ...t }));
  const order = priorityOrder(tasks);

  const jobState = new Map();
  tasks.forEach((t) => jobState.set(t.id, { nextRelease: 0, remaining: 0, deadline: t.t }));

  let clockMs = 0;

  const segments = [];
  let runningTaskId = IDLE_ID;
  let runningSince = 0;
  const missed = [];

  function closeSegment(endMs) {
    if (endMs <= runningSince) {
      runningSince = endMs;
      return;
    }
    segments.push({ taskId: runningTaskId, start: runningSince, end: endMs });
    runningSince = endMs;
    const cutoff = clockMs - HISTORY_MS;
    while (segments.length && segments[0].end < cutoff) segments.shift();
  }

  function tickMs() {
    for (const t of tasks) {
      const js = jobState.get(t.id);
      if (clockMs >= js.nextRelease) {
        if (js.remaining > 0) {
          missed.push({ taskId: t.id, atMs: clockMs });
          if (missed.length > 24) missed.shift();
        }
        js.remaining = t.c;
        js.deadline = js.nextRelease + t.t;
        js.nextRelease += t.t;
      }
    }

    let next = IDLE_ID;
    for (const t of order) {
      if (jobState.get(t.id).remaining > 0) {
        next = t.id;
        break;
      }
    }

    if (next !== runningTaskId) {
      closeSegment(clockMs);
      runningTaskId = next;
    }

    if (next !== IDLE_ID) {
      jobState.get(next).remaining -= 1;
    }

    clockMs += 1;
  }

  return {
    advance(simMs) {
      const steps = Math.max(0, Math.min(4000, Math.round(simMs)));
      for (let i = 0; i < steps; i++) tickMs();
    },

    setTaskParam(taskId, key, value) {
      const t = tasks.find((x) => x.id === taskId);
      if (!t || !(key === "c" || key === "t")) return;
      t[key] = value;
      order.sort((a, b) => a.t - b.t);
      const js = jobState.get(taskId);
      js.remaining = 0;
      js.nextRelease = clockMs;
    },

    reset() {
      clockMs = 0;
      segments.length = 0;
      missed.length = 0;
      runningTaskId = IDLE_ID;
      runningSince = 0;
      tasks.forEach((t) => jobState.set(t.id, { nextRelease: 0, remaining: 0, deadline: t.t }));
    },

    getSnapshot() {
      const liveSegments = segments.concat([{ taskId: runningTaskId, start: runningSince, end: clockMs }]);
      return {
        clockMs,
        tasks: tasks.map((t) => ({ ...t })),
        order: order.map((t) => t.id),
        segments: liveSegments,
        missed: missed.slice(-10),
        utilization: computeUtilization(tasks),
        ubBound: computeUBBound(tasks.length),
        schedulable: isSchedulable(tasks),
      };
    },
  };
}
